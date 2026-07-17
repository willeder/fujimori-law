/**
 * Vercel Function（具体名・従来 req/res 形式）: データ系 API の本番提供。
 *
 * キャッチオール命名（api/[...path].ts）は多階層パス（例: /api/cases/1）が
 * 関数に割り当たらない事象があったため、具体名 /api/data に集約し、
 * vercel.json の rewrite で /api/* を本関数へ流す方式に変更。
 * ルートは rewrite が付与する `__path` クエリ、無ければ req.url から判定する。
 *
 * 専用関数がある auth / members / line/webhook / cron は filesystem 側で
 * 先にマッチするため rewrite されず、ここには到達しない。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  apiRoutes,
  getCaseById,
  searchCases,
  searchCreditors,
  getCreditorReminders,
  getSettlementCreditors,
  updateCaseField,
  updateCreditorField,
  updatePaymentField,
  createPayment,
  createContactHistory,
  updateContactHistoryField,
  deleteContactHistory,
  deleteCase,
  getCaseChanges,
  revertChange,
  getLineLink,
  issueLineCode,
  presenceHeartbeat,
  presenceLeave,
} from '../src/server/handlers.js'
import * as gmo from '../src/server/gmoTransfer.js'
import * as intake from '../src/server/intakeImport.js'
import * as deposits from '../src/server/depositImport.js'
import * as gmoApi from '../src/server/gmoApi.js'
import * as creditorFiles from '../src/server/creditorFiles.js'
import * as mail from '../src/server/mail.js'
import { getSessionToken, getSessionUser } from '../src/server/auth.js'
import { sendLineBroadcast, getLineBroadcastHistory } from '../src/server/lineBroadcast.js'
import { getReminderCandidates, sendReminders } from '../src/server/paymentReminder.js'
import { prisma } from '../src/server/db.js'

export const config = { runtime: 'nodejs' }

/**
 * リクエストボディを Buffer で取得。
 * Vercel の Node 関数はボディを事前パースして req.body に載せ、生ストリームを
 * 消費済みにする。そのため req.body を最優先で使い、無い時だけストリームを読む。
 *   - Buffer       → そのまま（CSVアップロード等のバイナリ）
 *   - string       → UTF-8 として Buffer 化
 *   - object       → JSON 文字列化（application/json の PATCH 等）
 */
async function getRawBody(req: IncomingMessage): Promise<Buffer> {
  const b = (req as IncomingMessage & { body?: unknown }).body
  if (Buffer.isBuffer(b)) return b
  if (typeof b === 'string') return Buffer.from(b, 'utf8')
  if (b && typeof b === 'object') return Buffer.from(JSON.stringify(b), 'utf8')
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const method = req.method ?? 'GET'
  const rawUrl = req.url ?? '/'
  const query = new URLSearchParams(rawUrl.split('?')[1] ?? '')
  // 論理パス: rewrite が付与する __path を優先、無ければ req.url から
  const fromRewrite = query.get('__path')
  const seg = (fromRewrite ?? '').replace(/^\/+/, '').replace(/\/+$/, '')
  const path = fromRewrite ? '/api/' + seg : rawUrl.split('?')[0]

  const json = (data: unknown, status = 200) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(data))
  }

  // ── 診断（認証不要） ──
  if (path === '/api/_diag') {
    const pings: number[] = []
    let dbError: string | null = null
    try {
      for (let i = 0; i < 3; i++) {
        const t = Date.now()
        await prisma.$queryRawUnsafe('SELECT 1')
        pings.push(Date.now() - t)
      }
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e)
    }
    let db: Record<string, unknown> = {}
    try {
      const u = new URL(process.env.DATABASE_URL ?? '')
      db = {
        host: u.hostname,
        port: u.port,
        pgbouncer: u.searchParams.get('pgbouncer') === 'true',
        connectionLimit: u.searchParams.get('connection_limit'),
      }
    } catch {
      /* noop */
    }
    // 固定IPプロキシの疎通確認（/api/_diag?egress=1 のときのみ実行）
    let gmoEgress: Record<string, unknown> | null = null
    if ((req.url ?? '').includes('egress=1')) {
      const proxyConfigured = Boolean(process.env.GMO_PROXY_URL)
      try {
        const { checkEgressIp } = await import('../src/server/gmoProxy.js')
        const t = Date.now()
        const ip = await checkEgressIp()
        gmoEgress = { ip, ms: Date.now() - t, proxyConfigured }
      } catch (e) {
        gmoEgress = { error: e instanceof Error ? e.message : String(e), proxyConfigured }
      }
    }
    json({
      region: process.env.VERCEL_REGION ?? null,
      coldConnectMs: pings[0] ?? -1,
      warmRttMs: pings.slice(1),
      dbError,
      db,
      gmoEgress,
      resolvedPath: path,
      now: new Date().toISOString(),
    })
    return
  }

  // ── 認証（データルートは全てログイン必須） ──
  const cookieHeader = (req.headers['cookie'] as string | undefined) ?? null
  const sessionUser = await getSessionUser(getSessionToken(cookieHeader))
  if (!sessionUser) {
    json({ error: 'unauthenticated' }, 401)
    return
  }
  const fwd = req.headers['x-forwarded-for']
  const meta = {
    ip: (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  }
  const editActor = { id: sessionUser.id, email: sessionUser.email, role: sessionUser.role }

  try {
    // ── 相談票CSV取込 ──
    if (path === '/api/intake/template') {
      const csv = intake.INTAKE_HEADERS.join(',') + '\r\n'
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="intake_template.csv"')
      res.end(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csv, 'utf8')]))
      return
    }
    if (path === '/api/intake/preview' && method === 'POST') {
      json(await intake.previewIntake(await getRawBody(req)))
      return
    }
    if (path === '/api/intake/commit' && method === 'POST') {
      const r = await intake.commitIntake(editActor, await getRawBody(req))
      json(r.body, r.status)
      return
    }

    // ── 入金データ取込（銀行明細 → 実入金反映。No.88/90/91） ──
    if (path === '/api/deposits/preview' && method === 'POST') {
      json(await deposits.planDepositImport(await getRawBody(req)))
      return
    }
    if (path === '/api/deposits/commit' && method === 'POST') {
      json(await deposits.commitDepositImport(editActor, await getRawBody(req)))
      return
    }

    // ── GMOあおぞらAPI連携（OAuth2 認可・No.153） ──
    if (path === '/api/gmo/auth/status' && method === 'GET') {
      json(await gmoApi.getStatus())
      return
    }
    if (path === '/api/gmo/auth/url' && method === 'GET') {
      if (!gmoApi.isConfigured()) {
        json({ error: 'GMO_CLIENT_ID / GMO_CLIENT_SECRET / GMO_REDIRECT_URI が未設定です' }, 400)
        return
      }
      json(await gmoApi.buildAuthorizationUrl())
      return
    }
    if (path === '/api/gmo/auth/callback' && method === 'GET') {
      const code = query.get('code') ?? ''
      const state = query.get('state') ?? ''
      const err = query.get('error')
      let msg: string
      if (err) {
        msg = `認可がキャンセル/失敗しました: ${err} ${query.get('error_description') ?? ''}`
      } else if (!code || !state) {
        msg = 'code / state がありません'
      } else {
        try {
          const r = await gmoApi.exchangeCode(editActor, code, state)
          msg = r.ok ? 'GMOあおぞらAPIの連携が完了しました。この画面は閉じて構いません。' : `連携に失敗しました: ${r.error}`
        } catch (e) {
          msg = `連携に失敗しました: ${e instanceof Error ? e.message : String(e)}`
        }
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(`<!doctype html><meta charset="utf-8"><title>GMO API連携</title><body style="font-family:sans-serif;padding:2rem"><p>${msg}</p><p><a href="/gmo-transfer">GMO振込出力へ戻る</a></p></body>`)
      return
    }
    if (path === '/api/gmo/userinfo' && method === 'GET') {
      json(await gmoApi.getUserInfo())
      return
    }

    // ── GMO: 未整備（支払条件・振込先 未入力）検知 ──
    if (path === '/api/gmo/incomplete' && method === 'GET') {
      // month(YYYY-MM)＝対象月。未指定なら当月。その月に支払いが必要な未整備のみ返す
      const month = query.get('month') ?? new Date().toISOString().slice(0, 7)
      json(await gmo.buildIncompleteRepayments(month))
      return
    }

    // ── GMO 一括振込ファイル ──
    if (path === '/api/gmo/transfers' || path === '/api/gmo/transfers/file') {
      const today = new Date().toISOString().slice(0, 10)
      const start = query.get('start') ?? today
      const end = query.get('end') ?? today
      const result = await gmo.buildGmoTransfers(start, end)
      if (path === '/api/gmo/transfers/file') {
        const outputCount = result.count - result.incompleteCount
        if (outputCount > 999) {
          res.setHeader('Content-Type', 'application/zip')
          res.setHeader('Content-Disposition', `attachment; filename="gmo_transfer_${start}.zip"`)
          res.end(gmo.buildZip(gmo.gmoCsvChunks(result)))
          return
        }
        res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS')
        res.setHeader('Content-Disposition', `attachment; filename="gmo_transfer_${start}.csv"`)
        res.end(gmo.toShiftJis(gmo.toGmoCsv(result)))
        return
      }
      json(result)
      return
    }

    // ── 編集中プレゼンス（同時編集の検知） ──
    if (path === '/api/presence/heartbeat' && method === 'POST') {
      const raw = (await getRawBody(req)).toString('utf8')
      const r = await presenceHeartbeat(
        { ...editActor, name: sessionUser.name ?? null },
        raw
      )
      json(r.body, r.status)
      return
    }
    if (path === '/api/presence/leave' && method === 'POST') {
      const raw = (await getRawBody(req)).toString('utf8')
      const r = await presenceLeave(editActor, raw)
      json(r.body, r.status)
      return
    }

    // ── 横断検索（複数条件AND） ──
    if (path === '/api/cases/search' && method === 'POST') {
      const raw = (await getRawBody(req)).toString('utf8')
      json(await searchCases(raw))
      return
    }

    // ── 債権者のDB全体横断検索（案件をまたぐ） ──
    if (path === '/api/creditors/search' && method === 'POST') {
      const raw = (await getRawBody(req)).toString('utf8')
      json(await searchCreditors(raw))
      return
    }

    // ── 債権者リマインド一覧（次回処理日ありのみ・軽量） ──
    if (path === '/api/creditors/reminders' && method === 'GET') {
      json(await getCreditorReminders())
      return
    }

    // ── 和解実績一覧用（必要列のみ・軽量） ──
    if (path === '/api/creditors/settlement' && method === 'GET') {
      json(await getSettlementCreditors())
      return
    }

    // ── メール送信・履歴（No.92/93） ──
    if (path === '/api/mail/send' && method === 'POST') {
      const r = await mail.sendMail(editActor, (await getRawBody(req)).toString('utf8'))
      json(r.body, r.status)
      return
    }
    if (path === '/api/mail/history' && method === 'GET') {
      const cid = query.get('caseId')
      json(await mail.getMailHistory(cid ? Number(cid) : null))
      return
    }
    if (path === '/api/mail/status' && method === 'GET') {
      json(mail.mailConfigured())
      return
    }

    // ── 債権者資料（各社タブのファイル格納・No.8） ──
    const creditorFilesList = path.match(/^\/api\/creditors\/(\d+)\/files$/)
    if (creditorFilesList) {
      const cid = Number(creditorFilesList[1])
      if (method === 'GET') {
        json(await creditorFiles.listCreditorFiles(cid))
        return
      }
      if (method === 'POST') {
        const r = await creditorFiles.uploadCreditorFile(
          editActor,
          cid,
          (await getRawBody(req)).toString('utf8')
        )
        json(r.body, r.status)
        return
      }
    }
    const creditorFileById = path.match(/^\/api\/creditors\/files\/(\d+)$/)
    if (creditorFileById) {
      const fid = Number(creditorFileById[1])
      if (method === 'GET') {
        const f = await creditorFiles.getCreditorFile(fid)
        if (!f) {
          json({ error: 'not found' }, 404)
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', f.mime)
        res.setHeader(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`
        )
        res.end(f.data)
        return
      }
      if (method === 'DELETE') {
        const r = await creditorFiles.deleteCreditorFile(editActor, fid)
        json(r.body, r.status)
        return
      }
    }

    // ── 案件編集・変更履歴・revert ──
    const caseById = path.match(/^\/api\/cases\/(\d+)$/)
    if (caseById) {
      if (method === 'GET') {
        json(await getCaseById(Number(caseById[1])))
        return
      }
      if (method === 'PATCH') {
        const raw = (await getRawBody(req)).toString('utf8')
        const r = await updateCaseField(editActor, Number(caseById[1]), raw, meta)
        json(r.body, r.status)
        return
      }
      if (method === 'DELETE') {
        const r = await deleteCase(editActor, Number(caseById[1]), meta)
        json(r.body, r.status)
        return
      }
    }
    const changesMatch = path.match(/^\/api\/cases\/(\d+)\/changes$/)
    if (changesMatch && method === 'GET') {
      json(await getCaseChanges(Number(changesMatch[1])))
      return
    }
    const revertMatch = path.match(/^\/api\/changes\/(\d+)\/revert$/)
    if (revertMatch && method === 'POST') {
      const r = await revertChange(editActor, revertMatch[1], meta)
      json(r.body, r.status)
      return
    }

    // ── 債権者・入金の行編集（永続化＋変更履歴） ──
    const creditorEdit = path.match(/^\/api\/creditors\/(\d+)$/)
    if (creditorEdit && method === 'PATCH') {
      const raw = (await getRawBody(req)).toString('utf8')
      const r = await updateCreditorField(editActor, Number(creditorEdit[1]), raw, meta)
      json(r.body, r.status)
      return
    }
    const paymentEdit = path.match(/^\/api\/payments\/(\d+)$/)
    if (paymentEdit && method === 'PATCH') {
      const raw = (await getRawBody(req)).toString('utf8')
      const r = await updatePaymentField(editActor, Number(paymentEdit[1]), raw, meta)
      json(r.body, r.status)
      return
    }
    if (path === '/api/payments' && method === 'POST') {
      const raw = (await getRawBody(req)).toString('utf8')
      const r = await createPayment(editActor, raw, meta)
      json(r.body, r.status)
      return
    }

    // ── 接触履歴の追加・編集・削除 ──
    if (path === '/api/contact-histories' && method === 'POST') {
      const raw = (await getRawBody(req)).toString('utf8')
      const r = await createContactHistory(editActor, raw, meta)
      json(r.body, r.status)
      return
    }
    const contactEdit = path.match(/^\/api\/contact-histories\/(\d+)$/)
    if (contactEdit && method === 'PATCH') {
      const raw = (await getRawBody(req)).toString('utf8')
      const r = await updateContactHistoryField(editActor, Number(contactEdit[1]), raw, meta)
      json(r.body, r.status)
      return
    }
    if (contactEdit && method === 'DELETE') {
      const r = await deleteContactHistory(editActor, Number(contactEdit[1]), meta)
      json(r.body, r.status)
      return
    }

    // ── LINE 連携リンク ──
    const lineLinks = path.match(/^\/api\/line\/links\/(\d+)$/)
    if (lineLinks) {
      const cid = Number(lineLinks[1])
      json(
        method === 'POST'
          ? await issueLineCode(cid, query.get('force') === '1')
          : await getLineLink(cid)
      )
      return
    }

    // ── LINE 一斉送信・送信履歴 ──
    if (path === '/api/line/broadcast' && method === 'POST') {
      const r = await sendLineBroadcast(editActor, (await getRawBody(req)).toString('utf8'), meta)
      json(r.body, r.status)
      return
    }
    if (path === '/api/line/broadcast-history' && method === 'GET') {
      json(await getLineBroadcastHistory())
      return
    }

    // ── 入金催促通知（候補抽出・手動送信） ──
    if (path === '/api/reminders/candidates' && method === 'GET') {
      json(await getReminderCandidates(query.get('timing') ?? ''))
      return
    }
    if (path === '/api/reminders/send' && method === 'POST') {
      const r = await sendReminders(editActor, (await getRawBody(req)).toString('utf8'), meta)
      json(r.body, r.status)
      return
    }

    // ── 一覧・集計（apiRoutes マップ。caseId 任意） ──
    if (method === 'GET') {
      const fn = apiRoutes[path]
      if (fn) {
        const cid = query.get('caseId')
        json(await fn(cid ? Number(cid) : undefined))
        return
      }
    }

    json({ error: 'not found', resolvedPath: path }, 404)
  } catch (e) {
    json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}
