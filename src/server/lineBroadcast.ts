/**
 * LINE 一斉送信（絞り込み送信）。
 * 案件IDの配列とメッセージ本文を受け取り、LINE連携済み（LINKED）の案件にだけ
 * 個別 push 送信する。未連携はスキップ。本文は受信者ごとに差し込み変数を置換。
 * 送信結果は監査ログ（entity='LineBroadcast'）に記録し、履歴として参照する。
 *
 * 差し込み変数: {名前} {フリガナ} {ID}
 */
import { prisma } from './db.js'
import { pushText } from './line.js'
import { writeAudit, type Actor } from './audit.js'

type EditMeta = { ip?: string | null; userAgent?: string | null }

function applyVars(
  template: string,
  c: { name: string | null; furigana: string | null; externalId: string | null }
): string {
  return template
    .replace(/\{名前\}/g, c.name ?? '')
    .replace(/\{フリガナ\}/g, c.furigana ?? '')
    .replace(/\{ID\}/g, c.externalId ?? '')
}

export type BroadcastResult = {
  status: number
  body: {
    ok: boolean
    error?: string
    total?: number
    sent?: number
    skipped?: number
    failed?: number
    results?: { caseId: number; name: string | null; result: 'sent' | 'skipped' | 'failed'; reason?: string }[]
  }
}

export async function sendLineBroadcast(actor: Actor, raw: string, meta: EditMeta): Promise<BroadcastResult> {
  let body: { caseIds?: number[]; message?: string }
  try {
    body = JSON.parse(raw || '{}') as { caseIds?: number[]; message?: string }
  } catch {
    return { status: 400, body: { ok: false, error: 'bad request' } }
  }
  const caseIds = Array.isArray(body.caseIds) ? body.caseIds.filter((n) => Number.isFinite(n)) : []
  const message = (body.message ?? '').trim()
  if (caseIds.length === 0) return { status: 400, body: { ok: false, error: '送信対象がありません' } }
  if (!message) return { status: 400, body: { ok: false, error: 'メッセージを入力してください' } }

  const cases = await prisma.case.findMany({
    where: { id: { in: caseIds } },
    select: {
      id: true,
      name: true,
      furigana: true,
      externalId: true,
      lineLink: { select: { lineUserId: true, status: true } },
    },
  })

  const results: NonNullable<BroadcastResult['body']['results']> = []
  let sent = 0
  let skipped = 0
  let failed = 0
  for (const c of cases) {
    const link = c.lineLink
    if (!link || link.status !== 'LINKED' || !link.lineUserId) {
      skipped++
      results.push({ caseId: c.id, name: c.name, result: 'skipped', reason: 'LINE未連携' })
      continue
    }
    try {
      await pushText(link.lineUserId, applyVars(message, c))
      sent++
      results.push({ caseId: c.id, name: c.name, result: 'sent' })
    } catch (e) {
      failed++
      results.push({
        caseId: c.id,
        name: c.name,
        result: 'failed',
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }

  await writeAudit({
    actor,
    action: 'EXPORT',
    entity: 'LineBroadcast',
    entityId: null,
    summary: `LINE一斉送信（送信${sent}・未連携${skipped}・失敗${failed}）`,
    metadata: { message, total: cases.length, sent, skipped, failed, results },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return {
    status: 200,
    body: { ok: true, total: cases.length, sent, skipped, failed, results },
  }
}

/** LINE一斉送信の履歴（監査ログから新しい順） */
export async function getLineBroadcastHistory() {
  const rows = await prisma.auditLog.findMany({
    where: { entity: 'LineBroadcast' },
    orderBy: { id: 'desc' },
    take: 100,
    include: { actor: { select: { name: true, email: true } } },
  })
  return rows.map((r) => {
    const m = (r.metadata ?? {}) as {
      message?: string
      total?: number
      sent?: number
      skipped?: number
      failed?: number
    }
    return {
      id: r.id.toString(),
      actor: r.actor?.name ?? r.actorEmail ?? '—',
      createdAt: r.createdAt.toISOString(),
      message: m.message ?? '',
      total: m.total ?? 0,
      sent: m.sent ?? 0,
      skipped: m.skipped ?? 0,
      failed: m.failed ?? 0,
    }
  })
}
