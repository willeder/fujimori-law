/**
 * LINE Webhook 処理（サーバ専用・トランスポート非依存）。
 * Vite 開発サーバ（vite.config.ts の dbApiPlugin）と
 * Vercel Function（api/line/webhook.ts）の双方から呼ばれる。
 *
 * 連携フロー（2ステップの登録コード方式）:
 *   follow            … 歓迎メッセージで「連携開始」の送信を依頼
 *   message「連携開始」 … 連携セッションを開始し、登録コードの入力を促す
 *   message（コード）   … セッション中の入力のみを登録コードとして照合し、LINKED にする
 *   unfollow          … ブロック扱いで連携を無効化（BLOCKED）
 *
 * ★重要（この公式アカウントはスタッフが手動チャットにも使う）:
 *   連携セッション中でも連携済みでもないユーザーの発言には **一切返信しない**。
 *   以前は受信テキストを無条件にコード照合していたため、通常の会話にまで
 *   「登録コードを送信してください。」「コードが確認できませんでした。」が
 *   毎回返っていた。トリガー語を受けたときだけ応答する。
 */
import { prisma } from './db.js'
import { replyText, verifyLineSignature } from './line.js'

/** 連携セッションを開始するトリガー語（メッセージ全体がこれと完全一致した場合のみ） */
const TRIGGER_WORDS = ['連携開始', '連携', '登録', '連携する', '登録する', 'れんけい']

/** セッションの有効時間（分）。この間だけ、次の発言をコードとして扱う */
const SESSION_MINUTES = 10

/** セッション中に許容する入力ミスの回数。超えたらセッションを終了し、以後は無言に戻る */
const MAX_ATTEMPTS = 5

const WELCOME =
  '友だち追加ありがとうございます。\n' +
  'ご連絡の準備のため、まずはこのトークに「連携開始」と送信してください。'

const PROMPT_CODE =
  '事務所からお渡しした「登録コード」（英数字8桁）をこのトークに送信してください。\n' +
  `（${SESSION_MINUTES}分以内にご入力ください）`

const CODE_NOT_FOUND =
  'コードが確認できませんでした。お手元のコードをご確認のうえ、再度送信してください。'

const CODE_FORMAT =
  '登録コードは英数字8桁です。お手元のコードをそのまま送信してください。'

const CODE_EXPIRED =
  'このコードは有効期限が切れています。事務所までお問い合わせください。'

const CODE_IN_USE =
  'このLINEアカウントは既に別の登録に使われています。事務所までお問い合わせください。'

const SESSION_OVER =
  '確認できませんでした。お手数ですが、もう一度「連携開始」と送信してからやり直してください。'

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

/** follow: 歓迎メッセージでトリガー語の送信を依頼 */
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
  // 連携セッションが残っていれば破棄
  await prisma.lineCodeSession.deleteMany({ where: { lineUserId: userId } })
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

/** トリガー語かどうか（メッセージ全体との完全一致のみ。会話中の誤爆を避ける） */
function isTrigger(raw: string): boolean {
  const t = raw.replace(/[\s　]/g, '')
  return TRIGGER_WORDS.includes(t)
}

/** 連携セッションを開始（既存があれば延長し、試行回数をリセット） */
async function startSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000)
  await prisma.lineCodeSession.upsert({
    where: { lineUserId: userId },
    create: { lineUserId: userId, expiresAt, attempts: 0 },
    update: { expiresAt, attempts: 0 },
  })
  // 期限切れセッションの掃除（軽量なのでトリガー時にまとめて実施）
  await prisma.lineCodeSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
}

const endSession = (userId: string) =>
  prisma.lineCodeSession.deleteMany({ where: { lineUserId: userId } })

/**
 * 入力ミスを1回計上する。上限に達したらセッションを終了し true を返す
 * （呼び出し側は「やり直してください」を案内して打ち切る）。
 */
async function countAttempt(userId: string, current: number): Promise<boolean> {
  const next = current + 1
  if (next >= MAX_ATTEMPTS) {
    await endSession(userId)
    return true
  }
  await prisma.lineCodeSession.update({
    where: { lineUserId: userId },
    data: { attempts: next },
  })
  return false
}

/**
 * message(text) の処理。
 *   1. 連携済みユーザー → 無反応
 *   2. トリガー語        → セッション開始し、コード入力を促す
 *   3. セッション中      → 登録コードとして照合
 *   4. それ以外          → 無反応（通常の会話を邪魔しない）
 */
async function handleText(ev: LineEvent): Promise<void> {
  const userId = ev.source?.userId
  if (!ev.replyToken || !userId) return

  const raw = (ev.message?.text ?? '').trim()

  // 1. 既に連携済みのユーザーは、以降の通常トークに一切反応しない。
  const myLink = await prisma.lineLink.findUnique({
    where: { lineUserId: userId },
  })
  if (myLink && myLink.status === 'LINKED') return

  // 2. トリガー語 → セッション開始
  if (isTrigger(raw)) {
    await startSession(userId)
    await replyText(ev.replyToken, PROMPT_CODE)
    return
  }

  // 3. セッション中のみ、コードとして扱う
  const session = await prisma.lineCodeSession.findUnique({
    where: { lineUserId: userId },
  })
  // 4. セッションが無い / 期限切れ → 無反応（ここが今回の要点）
  if (!session) return
  if (session.expiresAt < new Date()) {
    await endSession(userId)
    return
  }

  const code = normalizeCode(raw)
  if (!/^[A-Z0-9]{8}$/.test(code)) {
    const over = await countAttempt(userId, session.attempts)
    await replyText(ev.replyToken, over ? SESSION_OVER : CODE_FORMAT)
    return
  }

  const link = await prisma.lineLink.findUnique({
    where: { registrationCode: code },
    include: { case: { select: { name: true } } },
  })

  if (!link || link.status === 'BLOCKED') {
    const over = await countAttempt(userId, session.attempts)
    await replyText(ev.replyToken, over ? SESSION_OVER : CODE_NOT_FOUND)
    return
  }
  if (link.codeExpiresAt && link.codeExpiresAt < new Date()) {
    await endSession(userId)
    await replyText(ev.replyToken, CODE_EXPIRED)
    return
  }

  // 既に別ユーザーで連携済みの userId か（1ユーザー=1案件想定）
  if (myLink && myLink.id !== link.id) {
    await endSession(userId)
    await replyText(ev.replyToken, CODE_IN_USE)
    return
  }

  await prisma.lineLink.update({
    where: { id: link.id },
    data: { lineUserId: userId, status: 'LINKED', linkedAt: new Date() },
  })
  await endSession(userId)

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
