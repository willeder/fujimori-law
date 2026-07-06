import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Connect } from 'vite'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'

// リポジトリ root の .env（DATABASE_URL など）を読み込む
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') })

/** リクエストの raw body を文字列で読み取る（LINE 署名検証は生バイト列が必要） */
function readRawBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** 生バイト列のまま読む（CSVの文字コード判定用） */
function readRawBuffer(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** /api/* を Vite 開発サーバ内で直接処理（DB 接続を内蔵）。別プロセス不要 */
function dbApiPlugin(): Plugin {
  const attach = (server: ViteDevServer) => {
    server.middlewares.use((req, res, next) => {
      const url = req.url?.split('?')[0]
      if (!url || !url.startsWith('/api/')) return next()
      void (async () => {
        try {
          const mod = (await server.ssrLoadModule('/src/server/handlers.ts')) as {
            apiRoutes: Record<string, (caseId?: number) => Promise<unknown>>
            getLineLink: (caseId: number) => Promise<unknown>
            issueLineCode: (caseId: number, force?: boolean) => Promise<unknown>
            getCaseById: (id: number) => Promise<unknown>
            searchCases: (raw: string) => Promise<unknown>
            searchCreditors: (raw: string) => Promise<unknown>
            getCreditorReminders: () => Promise<unknown>
            getSettlementCreditors: () => Promise<unknown>
            updateCaseField: (
              actor: { id: string; email: string },
              id: number,
              raw: string,
              meta: { ip?: string | null; userAgent?: string | null }
            ) => Promise<{ status: number; body: unknown }>
            getCaseChanges: (id: number) => Promise<unknown>
            revertChange: (
              actor: { id: string; email: string },
              changeLogId: string,
              meta: { ip?: string | null; userAgent?: string | null }
            ) => Promise<{ status: number; body: unknown }>
            updateCreditorField: (
              actor: { id: string; email: string },
              id: number,
              raw: string,
              meta: { ip?: string | null; userAgent?: string | null }
            ) => Promise<{ status: number; body: unknown }>
            updatePaymentField: (
              actor: { id: string; email: string },
              id: number,
              raw: string,
              meta: { ip?: string | null; userAgent?: string | null }
            ) => Promise<{ status: number; body: unknown }>
            createPayment: (
              actor: { id: string; email: string },
              raw: string,
              meta: { ip?: string | null; userAgent?: string | null }
            ) => Promise<{ status: number; body: unknown }>
            createContactHistory: (
              actor: { id: string; email: string },
              raw: string,
              meta: { ip?: string | null; userAgent?: string | null }
            ) => Promise<{ status: number; body: unknown }>
            updateContactHistoryField: (
              actor: { id: string; email: string },
              id: number,
              raw: string,
              meta: { ip?: string | null; userAgent?: string | null }
            ) => Promise<{ status: number; body: unknown }>
            deleteContactHistory: (
              actor: { id: string; email: string },
              id: number,
              meta: { ip?: string | null; userAgent?: string | null }
            ) => Promise<{ status: number; body: unknown }>
            deleteCase: (
              actor: { id: string; email: string; role?: string | null },
              id: number,
              meta: { ip?: string | null; userAgent?: string | null }
            ) => Promise<{ status: number; body: unknown }>
            presenceHeartbeat: (
              actor: { id: string; email: string; name?: string | null },
              raw: string
            ) => Promise<{ status: number; body: unknown }>
            presenceLeave: (
              actor: { id: string; email: string },
              raw: string
            ) => Promise<{ status: number; body: unknown }>
          }

          const fwd = req.headers['x-forwarded-for']
          const meta = {
            ip: (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? null,
            userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
            cookieHeader: (req.headers['cookie'] as string | undefined) ?? null,
          }

          // ── 認証（login/logout/me） ──
          if (url.startsWith('/api/auth/')) {
            const authMod = (await server.ssrLoadModule(
              '/src/server/authHandlers.ts'
            )) as typeof import('./src/server/authHandlers')
            let result
            if (url === '/api/auth/login' && req.method === 'POST') {
              result = await authMod.handleLogin(await readRawBody(req), meta)
            } else if (url === '/api/auth/logout' && req.method === 'POST') {
              result = await authMod.handleLogout(meta)
            } else if (url === '/api/auth/me' && req.method === 'GET') {
              result = await authMod.handleMe(meta)
            } else {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'not found' }))
              return
            }
            if (result.setCookie) res.setHeader('Set-Cookie', result.setCookie)
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(result.body))
            return
          }

          // ── LINE Webhook（follow/message/unfollow → 連携） ──
          if (url === '/api/line/webhook' && req.method === 'POST') {
            const { handleLineWebhook } = (await server.ssrLoadModule(
              '/src/server/lineWebhook.ts'
            )) as typeof import('./src/server/lineWebhook')
            const rawBody = await readRawBody(req)
            const signature =
              (req.headers['x-line-signature'] as string | undefined) ?? null
            const result = await handleLineWebhook(rawBody, signature)
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(
              typeof result.body === 'string'
                ? JSON.stringify({ message: result.body })
                : JSON.stringify(result.body)
            )
            return
          }

          // ── 入金予定リマインド（手動実行用。本番は Vercel Cron） ──
          if (url === '/api/cron/payment-reminder') {
            const secret = process.env.CRON_SECRET
            if (secret) {
              const auth = req.headers['authorization']
              if (auth !== `Bearer ${secret}`) {
                res.statusCode = 401
                res.end(JSON.stringify({ error: 'unauthorized' }))
                return
              }
            }
            const pr = (await server.ssrLoadModule(
              '/src/server/paymentReminder.ts'
            )) as typeof import('./src/server/paymentReminder')
            const params = new URLSearchParams(req.url?.split('?')[1] ?? '')
            const timing = params.get('timing')
            const summary =
              timing && pr.getTimingDef(timing)
                ? await pr.runReminderTiming(timing)
                : await pr.runPaymentReminder(
                    params.get('days') !== null
                      ? Number(params.get('days'))
                      : pr.DEFAULT_DAYS_BEFORE
                  )
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(summary))
            return
          }

          // ── セッション保護: ここまで来た /api/* はログイン必須 ──
          // （/api/auth/login・/api/line/webhook・/api/cron/* は上で処理済み）
          const authLib = (await server.ssrLoadModule(
            '/src/server/auth.ts'
          )) as typeof import('./src/server/auth')
          const sessionUser = await authLib.getSessionUser(
            authLib.getSessionToken(meta.cookieHeader)
          )
          if (!sessionUser) {
            res.statusCode = 401
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: 'unauthenticated' }))
            return
          }

          // ── メンバー管理（ADMIN 限定。actor=sessionUser） ──
          if (url.startsWith('/api/members')) {
            const mh = (await server.ssrLoadModule(
              '/src/server/memberHandlers.ts'
            )) as typeof import('./src/server/memberHandlers')
            const actor = {
              id: sessionUser.id,
              email: sessionUser.email,
              role: sessionUser.role,
            }
            let result
            if (url === '/api/members' && req.method === 'GET') {
              result = await mh.listMembers(actor, meta)
            } else if (url === '/api/members' && req.method === 'POST') {
              result = await mh.createMember(actor, await readRawBody(req), meta)
            } else {
              const mm = url.match(/^\/api\/members\/([^/]+?)(\/reset-password)?$/)
              if (mm && mm[2] && req.method === 'POST') {
                result = await mh.resetPassword(actor, mm[1], await readRawBody(req), meta)
              } else if (mm && !mm[2] && req.method === 'PATCH') {
                result = await mh.updateMember(actor, mm[1], await readRawBody(req), meta)
              } else {
                result = { status: 404, body: { error: 'not found' } }
              }
            }
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(result.body))
            return
          }

          // ── 横断検索（複数条件AND） ──
          if (url === '/api/creditors/search' && req.method === 'POST') {
            const out = await mod.searchCreditors(await readRawBody(req))
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(out))
            return
          }
          if (url === '/api/creditors/reminders' && req.method === 'GET') {
            const out = await mod.getCreditorReminders()
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(out))
            return
          }
          if (url === '/api/creditors/settlement' && req.method === 'GET') {
            const out = await mod.getSettlementCreditors()
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(out))
            return
          }
          if (url === '/api/cases/search' && req.method === 'POST') {
            const out = await mod.searchCases(await readRawBody(req))
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(out))
            return
          }

          // ── 編集中プレゼンス（同時編集の検知） ──
          if (url === '/api/presence/heartbeat' && req.method === 'POST') {
            const r = await mod.presenceHeartbeat(
              { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name ?? null },
              await readRawBody(req)
            )
            res.statusCode = r.status
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(r.body))
            return
          }
          if (url === '/api/presence/leave' && req.method === 'POST') {
            const r = await mod.presenceLeave(
              { id: sessionUser.id, email: sessionUser.email },
              await readRawBody(req)
            )
            res.statusCode = r.status
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(r.body))
            return
          }

          // ── LINE 一斉送信・送信履歴 ──
          if (
            (url === '/api/line/broadcast' && req.method === 'POST') ||
            (url === '/api/line/broadcast-history' && req.method === 'GET')
          ) {
            const lb = (await server.ssrLoadModule(
              '/src/server/lineBroadcast.ts'
            )) as typeof import('./src/server/lineBroadcast')
            const editActor = { id: sessionUser.id, email: sessionUser.email }
            if (url === '/api/line/broadcast') {
              const r = await lb.sendLineBroadcast(editActor, await readRawBody(req), meta)
              res.statusCode = r.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(r.body))
              return
            }
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(await lb.getLineBroadcastHistory()))
            return
          }

          // ── 入金催促通知（候補抽出・手動送信） ──
          if (
            (url === '/api/reminders/candidates' && req.method === 'GET') ||
            (url === '/api/reminders/send' && req.method === 'POST')
          ) {
            const pr = (await server.ssrLoadModule(
              '/src/server/paymentReminder.ts'
            )) as typeof import('./src/server/paymentReminder')
            if (url === '/api/reminders/candidates') {
              const timing =
                new URLSearchParams(req.url?.split('?')[1] ?? '').get('timing') ?? ''
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(await pr.getReminderCandidates(timing)))
              return
            }
            const editActor = { id: sessionUser.id, email: sessionUser.email }
            const r = await pr.sendReminders(editActor, await readRawBody(req), meta)
            res.statusCode = r.status
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(r.body))
            return
          }

          // ── 案件編集の永続化・変更履歴・revert ──
          {
            const editActor = {
              id: sessionUser.id,
              email: sessionUser.email,
              role: sessionUser.role,
            }
            const changesMatch = url.match(/^\/api\/cases\/(\d+)\/changes$/)
            const editMatch = url.match(/^\/api\/cases\/(\d+)$/)
            const revertMatch = url.match(/^\/api\/changes\/(\d+)\/revert$/)
            if (changesMatch && req.method === 'GET') {
              const out = await mod.getCaseChanges(Number(changesMatch[1]))
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(out))
              return
            }
            if (editMatch && req.method === 'PATCH') {
              const r = await mod.updateCaseField(
                editActor,
                Number(editMatch[1]),
                await readRawBody(req),
                meta
              )
              res.statusCode = r.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(r.body))
              return
            }
            if (editMatch && req.method === 'DELETE') {
              const r = await mod.deleteCase(editActor, Number(editMatch[1]), meta)
              res.statusCode = r.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(r.body))
              return
            }
            if (revertMatch && req.method === 'POST') {
              const r = await mod.revertChange(editActor, revertMatch[1], meta)
              res.statusCode = r.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(r.body))
              return
            }
            const creditorEdit = url.match(/^\/api\/creditors\/(\d+)$/)
            if (creditorEdit && req.method === 'PATCH') {
              const r = await mod.updateCreditorField(
                editActor,
                Number(creditorEdit[1]),
                await readRawBody(req),
                meta
              )
              res.statusCode = r.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(r.body))
              return
            }
            const paymentEdit = url.match(/^\/api\/payments\/(\d+)$/)
            if (paymentEdit && req.method === 'PATCH') {
              const r = await mod.updatePaymentField(
                editActor,
                Number(paymentEdit[1]),
                await readRawBody(req),
                meta
              )
              res.statusCode = r.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(r.body))
              return
            }
            if (url === '/api/payments' && req.method === 'POST') {
              const r = await mod.createPayment(editActor, await readRawBody(req), meta)
              res.statusCode = r.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(r.body))
              return
            }
            if (url === '/api/contact-histories' && req.method === 'POST') {
              const r = await mod.createContactHistory(editActor, await readRawBody(req), meta)
              res.statusCode = r.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(r.body))
              return
            }
            const contactEdit = url.match(/^\/api\/contact-histories\/(\d+)$/)
            if (contactEdit && req.method === 'PATCH') {
              const r = await mod.updateContactHistoryField(
                editActor,
                Number(contactEdit[1]),
                await readRawBody(req),
                meta
              )
              res.statusCode = r.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(r.body))
              return
            }
            if (contactEdit && req.method === 'DELETE') {
              const r = await mod.deleteContactHistory(editActor, Number(contactEdit[1]), meta)
              res.statusCode = r.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(r.body))
              return
            }
          }

          // ── 相談票CSV取込（新規依頼者の一括登録） ──
          if (
            url === '/api/intake/preview' ||
            url === '/api/intake/commit' ||
            url === '/api/intake/template'
          ) {
            const intake = (await server.ssrLoadModule(
              '/src/server/intakeImport.ts'
            )) as typeof import('./src/server/intakeImport')
            if (url === '/api/intake/template') {
              const csv = intake.INTAKE_HEADERS.join(',') + '\r\n'
              const bom = Buffer.from([0xef, 0xbb, 0xbf])
              res.setHeader('Content-Type', 'text/csv; charset=utf-8')
              res.setHeader(
                'Content-Disposition',
                'attachment; filename="intake_template.csv"'
              )
              res.end(Buffer.concat([bom, Buffer.from(csv, 'utf8')]))
              return
            }
            const buf = await readRawBuffer(req)
            if (url === '/api/intake/preview') {
              const out = await intake.previewIntake(buf)
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(out))
              return
            }
            const actor = { id: sessionUser.id, email: sessionUser.email }
            const r = await intake.commitIntake(actor, buf)
            res.statusCode = r.status
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(r.body))
            return
          }

          // ── GMO: 未整備（支払条件・振込先 未入力）検知 ──
          if (url === '/api/gmo/incomplete' && req.method === 'GET') {
            const gmo = (await server.ssrLoadModule(
              '/src/server/gmoTransfer.ts'
            )) as typeof import('./src/server/gmoTransfer')
            const q = new URLSearchParams(req.url?.split('?')[1] ?? '')
            const month = q.get('month') ?? new Date().toISOString().slice(0, 7)
            const result = await gmo.buildIncompleteRepayments(month)
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(result))
            return
          }

          // ── GMO 一括振込ファイル ──
          if (url === '/api/gmo/transfers' || url === '/api/gmo/transfers/file') {
            const gmo = (await server.ssrLoadModule(
              '/src/server/gmoTransfer.ts'
            )) as typeof import('./src/server/gmoTransfer')
            const q = new URLSearchParams(req.url?.split('?')[1] ?? '')
            const today = new Date().toISOString().slice(0, 10)
            const start = q.get('start') ?? today
            const end = q.get('end') ?? today
            const result = await gmo.buildGmoTransfers(start, end)
            if (url === '/api/gmo/transfers/file') {
              const outputCount = result.count - result.incompleteCount
              if (outputCount > 999) {
                // 999件/ファイル上限で分割し ZIP で一括ダウンロード
                const zip = gmo.buildZip(gmo.gmoCsvChunks(result))
                res.setHeader('Content-Type', 'application/zip')
                res.setHeader(
                  'Content-Disposition',
                  `attachment; filename="gmo_transfer_${start}.zip"`
                )
                res.end(zip)
                return
              }
              const buf = gmo.toShiftJis(gmo.toGmoCsv(result))
              res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS')
              res.setHeader(
                'Content-Disposition',
                `attachment; filename="gmo_transfer_${start}.csv"`
              )
              res.end(buf)
              return
            }
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(result))
            return
          }

          let data: unknown
          const caseByIdMatch = url.match(/^\/api\/cases\/(\d+)$/)
          const lineMatch = url.match(/^\/api\/line\/links\/(\d+)$/)
          if (caseByIdMatch) {
            data = await mod.getCaseById(Number(caseByIdMatch[1]))
          } else if (lineMatch) {
            const caseId = Number(lineMatch[1])
            const force =
              new URLSearchParams(req.url?.split('?')[1] ?? '').get('force') === '1'
            data =
              req.method === 'POST'
                ? await mod.issueLineCode(caseId, force)
                : await mod.getLineLink(caseId)
          } else {
            const handler = mod.apiRoutes[url]
            if (!handler) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'not found' }))
              return
            }
            const cidParam = new URLSearchParams(
              req.url?.split('?')[1] ?? ''
            ).get('caseId')
            const cid = cidParam ? Number(cidParam) : undefined
            data = await handler(cid)
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(data))
        } catch (e) {
          res.statusCode = 500
          res.end(
            JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
          )
        }
      })()
    })
  }
  return {
    name: 'db-api',
    configureServer(server) {
      attach(server)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Basic 認証は撤去し、アプリ内のログイン認証（/api/auth/*・セッション）へ移行
  plugins: [react(), tailwindcss(), dbApiPlugin()],
})
