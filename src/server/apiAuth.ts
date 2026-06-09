/**
 * Vercel Functions 用の共通ヘルパー（Web 標準 Request 前提）。
 * セッションから actor を解決し、ReqMeta と JSON レスポンスを作る。
 */
import { getSessionToken, getSessionUser } from './auth'
import type { Actor, ApiResult, ReqMeta } from './memberHandlers'

export function reqMeta(req: Request): ReqMeta {
  return {
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent'),
  }
}

export async function resolveActor(req: Request): Promise<Actor | null> {
  const u = await getSessionUser(getSessionToken(req.headers.get('cookie')))
  return u ? { id: u.id, email: u.email, role: u.role } : null
}

export function jsonResponse(result: ApiResult): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'unauthenticated' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
