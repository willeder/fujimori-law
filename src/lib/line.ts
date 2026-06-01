/**
 * LINE Messaging API クライアントと署名検証。
 * 認証情報は環境変数（LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET）。
 */
import { messagingApi, validateSignature } from '@line/bot-sdk'
import { randomBytes } from 'node:crypto'

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
const channelSecret = process.env.LINE_CHANNEL_SECRET || ''

export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken,
})

/** Webhook 署名検証（x-line-signature と raw body を照合） */
export function verifyLineSignature(
  body: string,
  signature: string | null
): boolean {
  if (!signature || !channelSecret) return false
  try {
    return validateSignature(body, channelSecret, signature)
  } catch {
    return false
  }
}

/** 誤読しにくい文字だけで登録コードを生成（既定 8 桁） */
export function generateRegistrationCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 0/O/1/I 等を除外
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

/** 返信メッセージ（replyToken 利用、テキスト） */
export async function replyText(replyToken: string, text: string) {
  await lineClient.replyMessage({
    replyToken,
    messages: [{ type: 'text', text }],
  })
}
