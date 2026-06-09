/**
 * Vercel Function: 現在のユーザー取得（本番）。
 */
import { handleMe } from '../../src/server/authHandlers.js'

export const config = { runtime: 'nodejs' }

export async function GET(req: Request): Promise<Response> {
  const result = await handleMe({
    cookieHeader: req.headers.get('cookie'),
  })
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
