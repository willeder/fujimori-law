/**
 * Vercel Function: メンバー更新（氏名・ロール・状態。ADMIN 限定）。
 */
import { updateMember } from '../../src/server/memberHandlers'
import { jsonResponse, reqMeta, resolveActor, unauthorized } from '../../src/server/apiAuth'

export const config = { runtime: 'nodejs' }

export async function PATCH(req: Request): Promise<Response> {
  const actor = await resolveActor(req)
  if (!actor) return unauthorized()
  const id = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? ''
  return jsonResponse(await updateMember(actor, id, await req.text(), reqMeta(req)))
}
