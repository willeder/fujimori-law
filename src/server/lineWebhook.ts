/**
 * LINE Webhook 処理（サーバ専用・トランスポート非依存）。
 * Vite 開発サーバ（vite.config.ts の dbApiPlugin）と
 * Vercel Function（api/line/webhook.ts）の双方から呼ばれる。
 *
 * 連携フロー（登録コードの受け取り方は2通り）:
 *   ① 案内文の全文一致 … 依頼者には案内文（src/constants/lineGuidance.ts）を
 *      「全文コピーしてそのまま返信」してもらう。受信テキストが案内文と全文一致
 *      したときだけ、その中の登録コードで連携する（セッション不要）。
 *   ② 2ステップ        … 「連携開始」を受け取ってからの一定時間だけ、8桁コード
 *      単体も受け付ける（全文コピーがうまくできない依頼者向けの保険）。
 *   follow   … 何も返さない（2026-10-09 変更。下記）
 *   unfollow … ブロック扱いで連携を無効化（BLOCKED）
 *
 * ★重要（この公式アカウントはスタッフが手動チャットにも使う）:
 *   連携セッション中でも連携済みでもないユーザーの発言には **一切返信しない**。
 *   以前は受信テキストを無条件にコード照合していたため、通常の会話にまで
 *   「登録コードを送信してください。」「コードが確認できませんでした。」が
 *   毎回返っていた。目印つきコードか、トリガー語を受けたときだけ応答する。
 *
 * ★友だち追加時は何も返さない（2026-10-09 事務所からのご指摘）:
 *   以前は follow で「【ご案内】を全文コピーして返信してください」と送っていたが、
 *   公式アカウントは受任前の相談者（面談前に友だち追加する方）も追加するため、
 *   相談者にまで連携の案内が届いてしまった。案内文は事務所が案件画面から個別に送る運用なので、
 *   友だち追加の時点でシステムからは何も送らない（あいさつは公式アカウント側の設定のみ）。
 *
 * ★合言葉は「連携開始」だけ（同日変更）:
 *   「連携」「登録」などの短い語も合言葉にしていたが、相談者が普段のチャットで「登録」と
 *   送っただけで「登録コードを送信してください」と返してしまうため絞った。
 */
import { prisma } from './db.js'
import { replyText, verifyLineSignature } from './line.js'
import { extractCodeFromGuidance } from '../constants/lineGuidance.js'

/** 連携セッションを開始するトリガー語（メッセージ全体がこれと完全一致した場合のみ） */
const TRIGGER_WORDS = ['連携開始']

/** セッションの有効時間（分）。この間だけ、次の発言をコードとして扱う */
const SESSION_MINUTES = 10

/** セッション中に許容する入力ミスの回数。超えたらセッションを終了し、以後は無言に戻る */
const MAX_ATTEMPTS = 5

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
 *   1. 連携済みユーザー   → 無反応
 *   2. 案内文と全文一致   → その場で照合して連携
 *   3. トリガー語         → セッション開始し、コード入力を促す
 *   4. セッション中       → 8桁コード単体も照合
 *   5. それ以外           → 無反応（通常の会話を邪魔しない）
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

  // 2. 案内文の全文一致。依頼者が案内文をそのままコピーして返信してきた場合だけ、
  //    その中の登録コードを取り出して照合する（改行・空白・全角半角のゆらぎは吸収）。
  const fromGuidance = extractCodeFromGuidance(raw)
  if (fromGuidance) {
    await applyCode(ev.replyToken, userId, myLink, fromGuidance)
    return
  }

  // 3. トリガー語 → セッション開始
  if (isTrigger(raw)) {
    await startSession(userId)
    await replyText(ev.replyToken, PROMPT_CODE)
    return
  }

  // 4. セッション中のみ、8桁コード単体も受け付ける
  const session = await prisma.lineCodeSession.findUnique({
    where: { lineUserId: userId },
  })
  // 5. セッションが無い / 期限切れ → 無反応（通常の会話を邪魔しない）
  if (!session) return
  if (session.expiresAt < new Date()) {
    await endSession(userId)
    return
  }

  const code = normalizeCode(raw)
  const over = await countAttempt(userId, session.attempts)
  await applyCode(ev.replyToken, userId, myLink, code, over)
}

/**
 * 登録コードを照合して連携を確定する。
 * 目印つきコード（セッション不要）とセッション中の入力の両方から呼ばれる。
 */
async function applyCode(
  replyToken: string,
  userId: string,
  myLink: { id: number } | null,
  code: string,
  attemptsOver = false
): Promise<void> {
  if (!/^[A-Z0-9]{8}$/.test(code)) {
    await replyText(replyToken, attemptsOver ? SESSION_OVER : CODE_FORMAT)
    return
  }

  const link = await prisma.lineLink.findUnique({
    where: { registrationCode: code },
    include: { case: { select: { name: true } } },
  })

  if (!link || link.status === 'BLOCKED') {
    await replyText(replyToken, attemptsOver ? SESSION_OVER : CODE_NOT_FOUND)
    return
  }
  if (link.codeExpiresAt && link.codeExpiresAt < new Date()) {
    await endSession(userId)
    await replyText(replyToken, CODE_EXPIRED)
    return
  }

  // 既に別ユーザーで連携済みの userId か（1ユーザー=1案件想定）
  if (myLink && myLink.id !== link.id) {
    await endSession(userId)
    await replyText(replyToken, CODE_IN_USE)
    return
  }

  await prisma.lineLink.update({
    where: { id: link.id },
    data: { lineUserId: userId, status: 'LINKED', linkedAt: new Date() },
  })
  await endSession(userId)

  // 冒頭に「お名前＋様」を置く（2026-10-08 事務所のご要望）
  await replyText(
    replyToken,
    `${link.case.name} 様\n連携が完了しました。\n今後、入金予定日のお知らせ等をこちらからご連絡します。`
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
      // follow（友だち追加）には何も返さない（先頭コメント参照）
      if (ev.type === 'unfollow') await handleUnfollow(ev)
      else if (ev.type === 'message' && ev.message?.type === 'text')
        await handleText(ev)
    } catch (e) {
      console.error('LINE event error:', e)
    }
  }

  return { status: 200, body: { ok: true } }
}
