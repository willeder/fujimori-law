/**
 * LINE Messaging API クライアントと署名検証（サーバ専用）。
 * @line/bot-sdk を使わず、node:crypto と fetch のみで実装。
 * Vite 開発サーバ（ssrLoadModule）／Vercel Functions の双方で動作する。
 *
 * 認証情報は環境変数:
 *   LINE_CHANNEL_ACCESS_TOKEN … Messaging API のチャネルアクセストークン
 *   LINE_CHANNEL_SECRET       … Webhook 署名検証用のチャネルシークレット
 * （DB 同様、root の .env を vite.config が process.env に読み込む）
 */
import crypto from 'node:crypto'

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
const channelSecret = process.env.LINE_CHANNEL_SECRET || ''

const REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply'
const PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push'

/**
 * Webhook 署名検証。raw body の HMAC-SHA256(base64) を x-line-signature と
 * タイミング安全に照合する。
 */
export function verifyLineSignature(
  body: string,
  signature: string | null
): boolean {
  if (!signature || !channelSecret) return false
  try {
    const expected = crypto
      .createHmac('sha256', channelSecret)
      .update(body)
      .digest('base64')
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** 誤読しにくい文字だけで登録コードを生成（既定 8 桁。0/O/1/I 等を除外） */
export function generateRegistrationCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

/** Messaging API への共通 POST。2xx 以外は例外（push の失敗をログに残すため） */
async function postMessage(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!channelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN 未設定')
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`LINE API ${res.status}: ${detail}`)
  }
}

/** 返信メッセージ（replyToken 利用、テキスト） */
export async function replyText(replyToken: string, text: string): Promise<void> {
  await postMessage(REPLY_ENDPOINT, {
    replyToken,
    messages: [{ type: 'text', text }],
  })
}

/** push メッセージ（userId 宛、テキスト） */
export async function pushText(to: string, text: string): Promise<void> {
  await postMessage(PUSH_ENDPOINT, {
    to,
    messages: [{ type: 'text', text }],
  })
}
