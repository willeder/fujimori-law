/**
 * 入金期日の一括変更。
 *
 * 事務所のご要望（2026-09-03。新システム改修要望シート 8行目）:
 *   「ご依頼者様のお給料日が変わられた際に、毎月の支払期日を一括変更する」
 *   「最長で10年分120行近い更新が必要になる為、これを全て手作業で行うのは
 *     人為的ミスの多発に繋がります」
 *
 * 実データでも 1案件あたりの未来分は平均57行・最大127行あり、手作業は現実的でない。
 * 月ごとに期日が違う案件も643件あるため、1月〜12月それぞれに日を指定できる形にする。
 *
 * 決めごと（事務所と確認済み）:
 *   ・その月に無い日（2月31日など）は **その月の末日に寄せる**
 *   ・対象は **今日以降** の入金予定。ただし **既に実入金がある行は変更しない**
 *     （未来日なのに入金済みの行が全体で229行ある。入金と予定の紐づけを壊さないため）
 *   ・触るのは入金予定日だけ。金額・充当・実績には一切手を付けない
 */
import { prisma } from './db.js'
import { writeAudit, type Actor } from './audit.js'

/** 月(1-12) → その月の入金日。指定の無い月は変更しない */
export type DueDateByMonth = Record<number, number | null | undefined>

export interface DueDateChange {
  paymentId: number
  from: string
  to: string
}

export interface DueDatePlan {
  caseId: number
  /** 実際に日付が変わる行 */
  changes: DueDateChange[]
  /** 今日以降だが実入金があるため触らない行数 */
  skippedPaid: number
  /** 指定の無い月なので触らない行数 */
  skippedNoRule: number
  /** 既に指定どおりの日付で、変える必要が無い行数 */
  skippedSame: number
}

const ymd = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** その月の末日 */
export function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

/**
 * 指定の日をその月に収める。
 * 例: 31日指定 → 2月は28（閏年は29）、4月は30。末日払いの運用に合わせる。
 */
export function clampDay(year: number, month1to12: number, day: number): number {
  const last = lastDayOfMonth(year, month1to12)
  return Math.min(Math.max(1, day), last)
}

/** 変更内容を組み立てる（DBには書かない） */
export async function planDueDateChange(
  caseId: number,
  byMonth: DueDateByMonth,
  todayIso?: string
): Promise<DueDatePlan> {
  const today = todayIso ?? ymd(new Date())
  const rows = await prisma.payment.findMany({
    where: { caseId, plannedDate: { gte: new Date(`${today}T00:00:00.000Z`) } },
    select: { id: true, plannedDate: true, actualDate: true, actualAmount: true },
    orderBy: { plannedDate: 'asc' },
  })
  const plan: DueDatePlan = { caseId, changes: [], skippedPaid: 0, skippedNoRule: 0, skippedSame: 0 }
  for (const r of rows) {
    if (!r.plannedDate) continue
    // 未来日なのに入金済みの行は触らない（入金と予定の紐づけを壊さない）
    if (r.actualDate != null || (r.actualAmount ?? 0) !== 0) {
      plan.skippedPaid += 1
      continue
    }
    const y = r.plannedDate.getUTCFullYear()
    const m = r.plannedDate.getUTCMonth() + 1
    const want = byMonth[m]
    if (want == null || !Number.isFinite(want)) {
      plan.skippedNoRule += 1
      continue
    }
    const day = clampDay(y, m, Number(want))
    const from = r.plannedDate.toISOString().slice(0, 10)
    const to = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (from === to) {
      plan.skippedSame += 1
      continue
    }
    plan.changes.push({ paymentId: r.id, from, to })
  }
  return plan
}

/** 変更を実行する。戻り値は実際に変えた件数 */
export async function applyDueDateChange(
  actor: Actor,
  caseId: number,
  byMonth: DueDateByMonth,
  meta: { ip?: string | null; userAgent?: string | null },
  todayIso?: string
): Promise<{ status: number; body: unknown }> {
  const plan = await planDueDateChange(caseId, byMonth, todayIso)
  if (plan.changes.length === 0) {
    return { status: 400, body: { error: '変更対象の行がありません', plan } }
  }
  // 1件ずつ更新するとN回の往復になる。CASE式でまとめて1回に落とす。
  const ids = plan.changes.map((c) => c.paymentId)
  const whens = plan.changes.map((c) => `WHEN ${c.paymentId} THEN DATE '${c.to}'`).join(' ')
  await prisma.$executeRawUnsafe(
    `UPDATE payments SET "plannedDate" = CASE id ${whens} END WHERE id IN (${ids.join(',')})`
  )
  await writeAudit({
    actor,
    action: 'UPDATE',
    entity: 'Payment',
    entityId: String(caseId),
    summary: `入金期日の一括変更（${plan.changes.length}件）`,
    metadata: {
      caseId,
      byMonth,
      changed: plan.changes.length,
      skippedPaid: plan.skippedPaid,
      skippedNoRule: plan.skippedNoRule,
      // 監査ログには先頭50件だけ残す（全件だと10年分で肥大するため）
      sample: plan.changes.slice(0, 50),
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
  return { status: 200, body: { ok: true, ...plan } }
}
