/**
 * Vercel Routing Middleware（Edge）
 * 静的配信では Vite の basic-auth プラグインが効かないため、ここで同一の固定認証を行う。
 *
 * 認証値を変える場合は vite.config.ts の定数と併せて更新すること。
 */
import { next } from '@vercel/functions'

/** vite.config.ts の DEFAULT_BASIC_USER と一致 */
const BASIC_AUTH_USER = 'mock'
/** vite.config.ts の DEFAULT_BASIC_PASSWORD と一致 */
const BASIC_AUTH_PASSWORD = 'Ui7mK9pQ2vLx4wR8'

function parseBasicAuthHeader(header: string | null): { user: string; pass: string } | null {
  if (!header?.startsWith('Basic ')) return null
  try {
    const raw = atob(header.slice(6))
    const i = raw.indexOf(':')
    if (i < 0) return null
    return { user: raw.slice(0, i), pass: raw.slice(i + 1) }
  } catch {
    return null
  }
}

export default function middleware(request: Request) {
  const creds = parseBasicAuthHeader(request.headers.get('authorization'))
  if (creds?.user === BASIC_AUTH_USER && creds?.pass === BASIC_AUTH_PASSWORD) {
    return next()
  }
  return new Response('401 Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="client-mock"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}

export const config = {
  matcher: '/:path*',
}
