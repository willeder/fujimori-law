/**
 * Vercel Function: ログイン（本番）。
 * 実処理は src/server/authHandlers.ts に集約。
 */
import { handleLogin } from '../../src/server/authHandlers'

export const config = { runtime: 'nodejs' }

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text()
  const result = await handleLogin(rawBody, {
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent'),
    cookieHeader: req.headers.get('cookie'),
  })
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
  }
  if (result.setCookie) headers['Set-Cookie'] = result.setCookie
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers,
  })
}
