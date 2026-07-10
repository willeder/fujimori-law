/**
 * システムからのメール送信＋送信履歴（No.92/93）。
 *
 * 送信基盤は環境変数で切り替え（追加npm依存なし・REST APIをfetchで呼ぶ）:
 *   RESEND_API_KEY   … Resend (https://resend.com) を使う場合
 *   SENDGRID_API_KEY … SendGrid を使う場合
 *   MAIL_FROM        … 差出人（例: "司法書士法人第一法務事務所 <no-reply@example.com>"）
 * どちらのキーも未設定の場合、送信APIは設定エラーを返す（履歴閲覧は可能）。
 *
 * 送信結果は email_logs に保存し、案件単位で履歴を閲覧できる。
 */
import { prisma } from './db.js'
import { writeAudit, type Actor } from './audit.js'

export function mailConfigured(): { configured: boolean; provider: string | null } {
  if (process.env.RESEND_API_KEY) return { configured: true, provider: 'resend' }
  if (process.env.SENDGRID_API_KEY) return { configured: true, provider: 'sendgrid' }
  return { configured: false, provider: null }
}

async function sendViaProvider(
  to: string,
  subject: string,
  text: string
): Promise<{ ok: boolean; provider: string; providerId: string | null; error: string | null }> {
  const from = process.env.MAIL_FROM ?? ''
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    })
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string }
    return r.ok
      ? { ok: true, provider: 'resend', providerId: j.id ?? null, error: null }
      : { ok: false, provider: 'resend', providerId: null, error: j.message ?? `HTTP ${r.status}` }
  }
  if (process.env.SENDGRID_API_KEY) {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from.replace(/^.*<|>.*$/g, '') || from, name: from.replace(/\s*<.*$/, '') },
        subject,
        content: [{ type: 'text/plain', value: text }],
      }),
    })
    if (r.ok || r.status === 202) {
      return {
        ok: true,
        provider: 'sendgrid',
        providerId: r.headers.get('x-message-id'),
        error: null,
      }
    }
    const t = await r.text().catch(() => '')
    return { ok: false, provider: 'sendgrid', providerId: null, error: t.slice(0, 300) || `HTTP ${r.status}` }
  }
  return {
    ok: false,
    provider: 'none',
    providerId: null,
    error: 'メール送信の設定がありません（RESEND_API_KEY または SENDGRID_API_KEY と MAIL_FROM を設定してください）',
  }
}

export async function sendMail(
  actor: Actor & { name?: string | null },
  raw: string
): Promise<{ status: number; body: unknown }> {
  let body: { caseId?: number; to?: string; subject?: string; text?: string }
  try {
    body = JSON.parse(raw || '{}') as typeof body
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  const to = (body.to ?? '').trim()
  const subject = (body.subject ?? '').trim()
  const text = body.text ?? ''
  const caseId = Number.isInteger(body.caseId) ? (body.caseId as number) : null
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return { status: 400, body: { error: '宛先メールアドレスが正しくありません' } }
  }
  if (!subject) return { status: 400, body: { error: '件名は必須です' } }
  if (!text.trim()) return { status: 400, body: { error: '本文は必須です' } }

  const r = await sendViaProvider(to, subject, text)
  const log = await prisma.emailLog.create({
    data: {
      caseId,
      toAddress: to,
      subject,
      body: text,
      status: r.ok ? 'SENT' : 'FAILED',
      error: r.error,
      provider: r.provider,
      providerId: r.providerId,
      sentBy: actor.email ?? '',
    },
  })
  await writeAudit({
    actor,
    action: 'CREATE',
    entity: 'EmailLog',
    entityId: String(log.id),
    summary: `メール送信${r.ok ? '' : '失敗'}: ${to} / ${subject}`,
    metadata: { caseId, provider: r.provider },
  })
  if (!r.ok) return { status: 502, body: { error: r.error, logId: log.id } }
  return { status: 200, body: { ok: true, logId: log.id } }
}

export async function getMailHistory(caseId: number | null): Promise<unknown> {
  const rows = await prisma.emailLog.findMany({
    where: caseId != null ? { caseId } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      caseId: true,
      toAddress: true,
      subject: true,
      body: true,
      status: true,
      error: true,
      sentBy: true,
      createdAt: true,
    },
  })
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
}
