/**
 * Vercel Function: GMOあおぞらネット銀行 Webhook 受け口（振込入金口座_入金明細通知）。
 *
 * vercel.json の rewrite（/api/gmo/:p* → /api/data）よりファイルシステム上の
 * ルートが先にマッチするため、認証必須の /api/data を経由せずここに届く
 * （LINE Webhook と同じ構成）。
 *
 * GMO のイベント通知設定に
 *   https://<本番ドメイン>/api/gmo/webhook
 * を登録する。
 *
 * 認証は「送信元IP制限」＋（設定時のみ）「x-webhook-secret」で行う。
 * 実処理は src/server/gmoWebhook.ts に集約。
 */
import { handleGmoWebhook } from '../../src/server/gmoWebhook.js'

export const config = { runtime: 'nodejs' }

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v
  })
  const result = await handleGmoWebhook(rawBody, headers)
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/** 疎通確認用。GMO 側の登録時に GET で叩かれることがあるため 200 を返す */
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true, endpoint: 'gmo-webhook' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
