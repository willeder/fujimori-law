/**
 * Vercel Function: LINE Webhook 受け口（本番）。
 * Web 標準ハンドラ（Request → Response）。req.text() で raw body を取得し、
 * 署名検証に用いる。実処理は src/server/lineWebhook.ts に集約。
 *
 * LINE Developers コンソールの Webhook URL に
 *   https://<本番ドメイン>/api/line/webhook
 * を設定する。
 */
import { handleLineWebhook } from '../../src/server/lineWebhook'

export const config = { runtime: 'nodejs' }

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text()
  const signature = req.headers.get('x-line-signature')
  const result = await handleLineWebhook(rawBody, signature)
  const body =
    typeof result.body === 'string'
      ? JSON.stringify({ message: result.body })
      : JSON.stringify(result.body)
  return new Response(body, {
    status: result.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
