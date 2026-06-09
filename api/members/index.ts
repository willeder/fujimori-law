/**
 * Vercel Function: メンバー一覧・追加（ADMIN 限定）。
 */
import { listMembers, createMember } from '../../src/server/memberHandlers'
import { jsonResponse, reqMeta, resolveActor, unauthorized } from '../../src/server/apiAuth'

export const config = { runtime: 'nodejs' }

export async function GET(req: Request): Promise<Response> {
  const actor = await resolveActor(req)
  if (!actor) return unauthorized()
  return jsonResponse(await listMembers(actor, reqMeta(req)))
}

export async function POST(req: Request): Promise<Response> {
  const actor = await resolveActor(req)
  if (!actor) return unauthorized()
  return jsonResponse(await createMember(actor, await req.text(), reqMeta(req)))
}
