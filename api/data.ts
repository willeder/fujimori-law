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
  updateCaseField,
  getCaseChanges,
  revertChange,
  getLineLink,
  issueLineCode,
} from '../src/server/handlers.js'
import * as gmo from '../src/server/gmoTransfer.js'
import * as intake from '../src/server/intakeImport.js'
import { getSessionToken, getSessionUser } from '../src/server/auth.js'
import { prisma } from '../src/server/db.js'

export const config = { runtime: 'nodejs' }

function readRawBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
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
    json({
      region: process.env.VERCEL_REGION ?? null,
      coldConnectMs: pings[0] ?? -1,
      warmRttMs: pings.slice(1),
      dbError,
      db,
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
  const editActor = { id: sessionUser.id, email: sessionUser.email }

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
      json(await intake.previewIntake(await readRawBuffer(req)))
      return
    }
    if (path === '/api/intake/commit' && method === 'POST') {
      const r = await intake.commitIntake(editActor, await readRawBuffer(req))
      json(r.body, r.status)
      return
    }

    // ── GMO 一括振込ファイル ──
    if (path === '/api/gmo/transfers' || path === '/api/gmo/transfers/file') {
      const today = new Date().toISOString().slice(0, 10)
      const start = query.get('start') ?? today
      const end = query.get('end') ?? today
      const ref = query.get('ref') ?? today
      const result = await gmo.buildGmoTransfers(start, end, ref)
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

    // ── 案件編集・変更履歴・revert ──
    const caseById = path.match(/^\/api\/cases\/(\d+)$/)
    if (caseById) {
      if (method === 'GET') {
        json(await getCaseById(Number(caseById[1])))
        return
      }
      if (method === 'PATCH') {
        const raw = (await readRawBuffer(req)).toString('utf8')
        const r = await updateCaseField(editActor, Number(caseById[1]), raw, meta)
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

    // ── LINE 連携リンク ──
    const lineLinks = path.match(/^\/api\/line\/links\/(\d+)$/)
    if (lineLinks) {
      const cid = Number(lineLinks[1])
      json(method === 'POST' ? await issueLineCode(cid) : await getLineLink(cid))
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
