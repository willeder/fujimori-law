/**
 * Vercel Function（キャッチオール）: データ系 API の本番提供。
 * 開発時は vite.config.ts の dbApiPlugin が同じルートを処理する。ここはその本番版。
 *
 * 専用関数が存在する auth / members / line/webhook / cron は、より具体的な
 * ファイルが優先されるため、このキャッチオールには到達しない。
 * 残りのデータルート（cases / creditors / payments / contact-histories /
 * changes / line/links / gmo / intake）をまとめて捌く。すべてログイン必須。
 */
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
import { resolveActor, reqMeta, unauthorized } from '../src/server/apiAuth.js'
import { prisma } from '../src/server/db.js'

export const config = { runtime: 'nodejs' }

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })

async function route(req: Request): Promise<Response> {
  const u = new URL(req.url)
  const path = u.pathname
  const method = req.method

  // ── 診断（認証不要）: 実行リージョンと DB 往復ms を返す ──
  // 例: {"region":"hnd1","dbPingMs":12} なら東京・近接。region が iad1 等で
  // dbPingMs が大きいとクロスリージョン（regions:["hnd1"] 未反映）。
  if (path === '/api/_diag') {
    const t0 = Date.now()
    let dbPingMs = -1
    let dbError: string | null = null
    try {
      await prisma.$queryRawUnsafe('SELECT 1')
      dbPingMs = Date.now() - t0
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e)
    }
    return json({
      region: process.env.VERCEL_REGION ?? null,
      dbPingMs,
      dbError,
      now: new Date().toISOString(),
    })
  }

  // データルートはすべてログイン必須（dev のセッションゲートと同等）
  const actor = await resolveActor(req)
  if (!actor) return unauthorized()
  const meta = reqMeta(req)
  const editActor = { id: actor.id, email: actor.email }

  try {
    // ── 相談票CSV取込 ──
    if (path === '/api/intake/template') {
      const csv = intake.INTAKE_HEADERS.join(',') + '\r\n'
      const bom = Buffer.from([0xef, 0xbb, 0xbf])
      return new Response(new Uint8Array(Buffer.concat([bom, Buffer.from(csv, 'utf8')])), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="intake_template.csv"',
        },
      })
    }
    if (path === '/api/intake/preview' && method === 'POST') {
      const buf = Buffer.from(await req.arrayBuffer())
      return json(await intake.previewIntake(buf))
    }
    if (path === '/api/intake/commit' && method === 'POST') {
      const buf = Buffer.from(await req.arrayBuffer())
      const r = await intake.commitIntake(editActor, buf)
      return json(r.body, r.status)
    }

    // ── GMO 一括振込ファイル ──
    if (path === '/api/gmo/transfers' || path === '/api/gmo/transfers/file') {
      const today = new Date().toISOString().slice(0, 10)
      const start = u.searchParams.get('start') ?? today
      const end = u.searchParams.get('end') ?? today
      const ref = u.searchParams.get('ref') ?? today
      const result = await gmo.buildGmoTransfers(start, end, ref)
      if (path === '/api/gmo/transfers/file') {
        const outputCount = result.count - result.incompleteCount
        if (outputCount > 999) {
          const zip = gmo.buildZip(gmo.gmoCsvChunks(result))
          return new Response(new Uint8Array(zip), {
            headers: {
              'Content-Type': 'application/zip',
              'Content-Disposition': `attachment; filename="gmo_transfer_${start}.zip"`,
            },
          })
        }
        const buf = gmo.toShiftJis(gmo.toGmoCsv(result))
        return new Response(new Uint8Array(buf), {
          headers: {
            'Content-Type': 'text/csv; charset=Shift_JIS',
            'Content-Disposition': `attachment; filename="gmo_transfer_${start}.csv"`,
          },
        })
      }
      return json(result)
    }

    // ── 案件編集・変更履歴・revert ──
    const caseById = path.match(/^\/api\/cases\/(\d+)$/)
    if (caseById) {
      if (method === 'GET') return json(await getCaseById(Number(caseById[1])))
      if (method === 'PATCH') {
        const r = await updateCaseField(editActor, Number(caseById[1]), await req.text(), meta)
        return json(r.body, r.status)
      }
    }
    const changesMatch = path.match(/^\/api\/cases\/(\d+)\/changes$/)
    if (changesMatch && method === 'GET') return json(await getCaseChanges(Number(changesMatch[1])))

    const revertMatch = path.match(/^\/api\/changes\/(\d+)\/revert$/)
    if (revertMatch && method === 'POST') {
      const r = await revertChange(editActor, revertMatch[1], meta)
      return json(r.body, r.status)
    }

    // ── LINE 連携リンク ──
    const lineLinks = path.match(/^\/api\/line\/links\/(\d+)$/)
    if (lineLinks) {
      const cid = Number(lineLinks[1])
      return json(method === 'POST' ? await issueLineCode(cid) : await getLineLink(cid))
    }

    // ── 一覧・集計（apiRoutes マップ。caseId 任意） ──
    if (method === 'GET') {
      const handler = apiRoutes[path]
      if (handler) {
        const cidParam = u.searchParams.get('caseId')
        return json(await handler(cidParam ? Number(cidParam) : undefined))
      }
    }

    return json({ error: 'not found' }, 404)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}

export const GET = route
export const POST = route
export const PATCH = route
