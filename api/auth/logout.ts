/**
 * Vercel Function: ログアウト（本番）。
 */
import { handleLogout } from '../../src/server/authHandlers'

export const config = { runtime: 'nodejs' }

export async function POST(req: Request): Promise<Response> {
  const result = await handleLogout({
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
