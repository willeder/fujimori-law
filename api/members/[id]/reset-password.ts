/**
 * Vercel Function: メンバーのパスワード再発行（ADMIN 限定）。
 */
import { resetPassword } from '../../../src/server/memberHandlers'
import { jsonResponse, reqMeta, resolveActor, unauthorized } from '../../../src/server/apiAuth'

export const config = { runtime: 'nodejs' }

export async function POST(req: Request): Promise<Response> {
  const actor = await resolveActor(req)
  if (!actor) return unauthorized()
  // /api/members/<id>/reset-password の <id>
  const segs = new URL(req.url).pathname.split('/').filter(Boolean)
  const id = segs[segs.length - 2] ?? ''
  return jsonResponse(await resetPassword(actor, id, await req.text(), reqMeta(req)))
}
