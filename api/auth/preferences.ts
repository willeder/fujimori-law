/**
 * Vercel Function: 表示設定の保存（本番）。いまは文字サイズのみ。
 */
import { handleUpdatePreferences } from '../../src/server/authHandlers.js'

export const config = { runtime: 'nodejs' }

export async function PATCH(req: Request): Promise<Response> {
  const raw = await req.text()
  const result = await handleUpdatePreferences(raw, {
    cookieHeader: req.headers.get('cookie'),
  })
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
