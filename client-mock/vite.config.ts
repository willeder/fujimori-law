import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Connect } from 'vite'
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'

const DEFAULT_BASIC_USER = 'mock'
/** 本番では必ず BASIC_AUTH_PASSWORD で上書きすること */
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
        `[basic-auth] BASIC_AUTH_PASSWORD 未設定のためデフォルトを使用しています（ユーザー: ${user}）。公開前に .env で上書きしてください。`
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), basicAuthPlugin()],
})
