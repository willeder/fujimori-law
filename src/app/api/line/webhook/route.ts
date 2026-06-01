import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { replyText, verifyLineSignature } from '@/lib/line'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WELCOME =
  '友だち追加ありがとうございます。\n本人確認のため、事務所からお渡しした「登録コード」をこのトークに送信してください。'

type LineEvent = {
  type: string
  replyToken?: string
  source?: { userId?: string }
  message?: { type?: string; text?: string }
}

/** follow: 歓迎メッセージで登録コード入力を依頼 */
async function handleFollow(ev: LineEvent) {
  if (ev.replyToken) await replyText(ev.replyToken, WELCOME)
}

/** unfollow（ブロック）: 連携を無効化 */
async function handleUnfollow(ev: LineEvent) {
  const userId = ev.source?.userId
  if (!userId) return
  await prisma.lineLink.updateMany({
    where: { lineUserId: userId },
    data: { status: 'BLOCKED' },
  })
}

/** message(text): 登録コードとして照合し、案件に userId を紐付け */
async function handleText(ev: LineEvent) {
  const userId = ev.source?.userId
  const code = ev.message?.text?.trim().toUpperCase()
  if (!ev.replyToken) return
  if (!userId || !code) {
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
  const existing = await prisma.lineLink.findUnique({
    where: { lineUserId: userId },
  })
  if (existing && existing.id !== link.id) {
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

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('x-line-signature')
  if (!verifyLineSignature(body, signature)) {
    return new NextResponse('invalid signature', { status: 401 })
  }

  let events: LineEvent[] = []
  try {
    events = (JSON.parse(body).events ?? []) as LineEvent[]
  } catch {
    return new NextResponse('bad request', { status: 400 })
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

  // LINE には常に 200 を返す
  return NextResponse.json({ ok: true })
}
