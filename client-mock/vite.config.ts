import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Connect } from 'vite'
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'

// リポジトリ root の .env（DATABASE_URL など）を読み込む
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

/** Vercel `middleware.ts` の BASIC_AUTH_* と同じ値（固定） */
const DEFAULT_BASIC_USER = 'mock'
const DEFAULT_BASIC_PASSWORD = 'Ui7mK9pQ2vLx4wR8'

function parseBasicAuthHeader(
  authHeader: string | undefined
): { username: string; password: string } | null {
  if (!authHeader?.startsWith('Basic ')) return null
  try {
    const raw = Buffer.from(authHeader.slice(6), 'base64').toString('utf8')
    const colon = raw.indexOf(':')
    if (colon < 0) return null
    return { username: raw.slice(0, colon), password: raw.slice(colon + 1) }
  } catch {
    return null
  }
}

function basicAuthMiddleware(expectedUser: string, expectedPass: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    const creds = parseBasicAuthHeader(req.headers.authorization)
    if (creds?.username === expectedUser && creds?.password === expectedPass) {
      next()
      return
    }
    res.statusCode = 401
    res.setHeader('WWW-Authenticate', 'Basic realm="client-mock"')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('401 Authentication required')
  }
}

function basicAuthPlugin(): Plugin {
  let warnedDefaults = false
  const attach = (server: ViteDevServer | PreviewServer) => {
    const user = process.env.BASIC_AUTH_USER || DEFAULT_BASIC_USER
    const pass = process.env.BASIC_AUTH_PASSWORD || DEFAULT_BASIC_PASSWORD
    if (!process.env.BASIC_AUTH_PASSWORD && !warnedDefaults) {
      warnedDefaults = true
      server.config.logger.warn(
        `[basic-auth] BASIC_AUTH_USER/PASSWORD 未設定のため固定デフォルトを使用（ユーザー: ${user}）。Vercel では middleware.ts の定数が使われます。`
      )
    }
    server.middlewares.use(basicAuthMiddleware(user, pass))
  }

  return {
    name: 'basic-auth',
    configureServer(server) {
      attach(server)
    },
    configurePreviewServer(server) {
      attach(server)
    },
  }
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
            apiRoutes: Record<string, () => Promise<unknown>>
          }
          const handler = mod.apiRoutes[url]
          if (!handler) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'not found' }))
            return
          }
          const data = await handler()
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
  plugins: [react(), tailwindcss(), basicAuthPlugin(), dbApiPlugin()],
})
