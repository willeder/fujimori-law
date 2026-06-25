/**
 * LINE Webhook 処理（サーバ専用・トランスポート非依存）。
 * Vite 開発サーバ（vite.config.ts の dbApiPlugin）と
 * Vercel Function（api/line/webhook.ts）の双方から呼ばれる。
 *
 * 連携フロー（登録コード方式）:
 *   follow   … 歓迎メッセージで登録コード入力を依頼
 *   message  … テキストを登録コードとして照合し、案件に lineUserId を紐付け（LINKED）
 *   unfollow … ブロック扱いで連携を無効化（BLOCKED）
 */
import { prisma } from './db.js'
import { replyText, verifyLineSignature } from './line.js'

const WELCOME =
  '友だち追加ありがとうございます。\n本人確認のため、事務所からお渡しした「登録コード」をこのトークに送信してください。'

type LineEvent = {
  type: string
  replyToken?: string
  source?: { userId?: string }
  message?: { type?: string; text?: string }
}

export type WebhookResult = {
  status: number
  body: unknown
}

/** follow: 歓迎メッセージで登録コード入力を依頼 */
async function handleFollow(ev: LineEvent): Promise<void> {
  if (ev.replyToken) await replyText(ev.replyToken, WELCOME)
}

/** unfollow（ブロック）: 連携を無効化 */
async function handleUnfollow(ev: LineEvent): Promise<void> {
  const userId = ev.source?.userId
  if (!userId) return
  await prisma.lineLink.updateMany({
    where: { lineUserId: userId },
    data: { status: 'BLOCKED' },
  })
}

/**
 * 受信テキストを登録コードへ正規化する。
 * 全角英数字→半角・大文字化し、英数字以外（空白・改行・記号・ゼロ幅文字等）を除去。
 * 依頼者のコピペや全角入力・余分なスペースによる不一致を吸収する。
 */
function normalizeCode(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/** message(text): 登録コードとして照合し、案件に userId を紐付け */
async function handleText(ev: LineEvent): Promise<void> {
  const userId = ev.source?.userId
  if (!ev.replyToken || !userId) return

  // 既に連携済みのユーザーは、以降の通常トークをコード照合の対象にしない。
  // （連携後にメッセージを送るたびエラーが返る問題を防ぐため、ここでは何も返信しない）
  const myLink = await prisma.lineLink.findUnique({
    where: { lineUserId: userId },
  })
  if (myLink && myLink.status === 'LINKED') return

  const code = normalizeCode(ev.message?.text ?? '')
  if (!code) {
    await replyText(ev.replyToken, '登録コードを送信してください。')
    return
  }

  const link = await prisma.lineLink.findUnique({
    where: { registrationCode: code },
    include: { case: { select: { name: true } } },
  })

  if (!link || link.status === 'BLOCKED') {
    await replyText(
      ev.replyToken,
      'コードが確認できませんでした。お手元のコードをご確認のうえ、再度送信してください。'
    )
    return
  }
  if (link.codeExpiresAt && link.codeExpiresAt < new Date()) {
    await replyText(
      ev.replyToken,
      'このコードは有効期限が切れています。事務所までお問い合わせください。'
    )
    return
  }

  // 既に別ユーザーで連携済みの userId か（1ユーザー=1案件想定）
  if (myLink && myLink.id !== link.id) {
    await replyText(
      ev.replyToken,
      'このLINEアカウントは既に別の登録に使われています。事務所までお問い合わせください。'
    )
    return
  }

  await prisma.lineLink.update({
    where: { id: link.id },
    data: { lineUserId: userId, status: 'LINKED', linkedAt: new Date() },
  })

  await replyText(
    ev.replyToken,
    `連携が完了しました（${link.case.name} 様）。\n今後、入金予定日のお知らせ等をこちらからご連絡します。`
  )
}

/**
 * Webhook 本体。raw body と署名を受け取り、検証・イベント処理を行う。
 * LINE には常に 200 を返す方針（個々のイベント失敗はログのみ）。
 */
export async function handleLineWebhook(
  rawBody: string,
  signature: string | null
): Promise<WebhookResult> {
  if (!verifyLineSignature(rawBody, signature)) {
    return { status: 401, body: 'invalid signature' }
  }

  let events: LineEvent[] = []
  try {
    events = (JSON.parse(rawBody).events ?? []) as LineEvent[]
  } catch {
    return { status: 400, body: 'bad request' }
  }

  for (const ev of events) {
    try {
      if (ev.type === 'follow') await handleFollow(ev)
      else if (ev.type === 'unfollow') await handleUnfollow(ev)
      else if (ev.type === 'message' && ev.message?.type === 'text')
        await handleText(ev)
    } catch (e) {
      console.error('LINE event error:', e)
    }
  }

  return { status: 200, body: { ok: true } }
}
