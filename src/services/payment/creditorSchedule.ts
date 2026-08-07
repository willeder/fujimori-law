/**
 * 債権者別の弁済スケジュールを「表示中の案件だけ」実行時に算出する。
 *
 * 背景: 入金情報（案件全体の入金明細）には弁済充当額が「全債権者の合算」でしか
 * 入っておらず、債権者別の実績内訳は元データに存在しない。そこで、
 *   1. 和解内容詳細から各債権者の弁済予定（日付・金額）を生成
 *   2. 案件全体の弁済実績（actualRepaymentAllocation の合計）を、
 *      期日の古い順（FIFO）で各債権者の予定に充当して「入金済み」を推定
 * という方針で各債権者タブを埋める。
 *
 * 注意: 債権者別の実績は合算からの推定値。actualDate は予定日で近似している。
 */
import type { Creditor, PaymentRecord } from '../../types/case.js'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function addCalendarMonths(y: number, m: number, add: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + add
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

function formatYmd(y: number, m: number, day: number): string {
  const d = Math.min(day, daysInMonth(y, m))
  return `${y}-${pad2(m)}-${pad2(d)}`
}

function installmentAmount(c: Creditor, indexZeroBased: number): number {
  const n = c.paymentCount ?? 0
  if (n <= 0) return 0
  if (n === 1) return c.firstPaymentAmount ?? c.finalPaymentAmount ?? 0
  if (indexZeroBased === 0) return c.firstPaymentAmount ?? 0
  if (indexZeroBased === n - 1) {
    return c.finalPaymentAmount ?? c.subsequentPaymentAmount ?? 0
  }
  return c.subsequentPaymentAmount ?? 0
}

/** 債権者別行の安定 ID（実データの入金 ID と衝突しない領域: 800,000〜） */
function rowId(creditorId: number, installmentNo: number): number {
  return 800_000 + creditorId * 500 + installmentNo
}

interface PlannedInstallment {
  creditorId: number
  installmentNo: number
  plannedDate: string
  plannedAmount: number
}

function plannedInstallmentsForCreditor(c: Creditor): PlannedInstallment[] {
  // 支払開始日（年月日 YYYY-MM-DD）と支払回数から毎月の予定日を生成する。
  // 支払日項目は廃止したため約定日は支払開始日から導出する。
  if (!c.paymentStartMonth || !c.paymentCount) return []
  const [y0, m0, d0] = c.paymentStartMonth.split('-').map((x) => Number(x))
  if (!y0 || !m0) return []
  // 月末約定対策: 支払開始日がその月の末日なら毎月「末日」、それ以外はその"日"。
  const startDay = d0 || 1
  const startIsEom = !!d0 && d0 === daysInMonth(y0, m0)
  const out: PlannedInstallment[] = []
  // 暴走防止の上限（実データ最大は 120 回程度）
  const n = Math.min(c.paymentCount, 600)
  for (let i = 0; i < n; i++) {
    const { y, m } = addCalendarMonths(y0, m0, i)
    // startIsEom のときは大きな日(31)を渡し formatYmd 側で各月の末日にクランプ
    out.push({
      creditorId: c.id,
      installmentNo: i + 1,
      plannedDate: formatYmd(y, m, startIsEom ? 31 : startDay),
      plannedAmount: installmentAmount(c, i),
    })
  }
  return out
}

/**
 * 案件の債権者別弁済スケジュール（予定＋合算実績のFIFO充当）を生成する。
 *
 * @param creditors          当該案件の債権者
 * @param caseLevelPayments  当該案件の案件全体入金明細（creditorId == null）
 */
export function buildCreditorScheduleForCase(
  creditors: Creditor[],
  caseLevelPayments: PaymentRecord[]
): PaymentRecord[] {
  // 1. 全債権者の予定インストールを生成
  const planned: PlannedInstallment[] = []
  for (const c of creditors) planned.push(...plannedInstallmentsForCreditor(c))

  // 2. 案件全体の弁済実績（合算）を集計 = 配分原資
  let pool = caseLevelPayments.reduce(
    (sum, p) => sum + (p.actualRepaymentAllocation ?? 0),
    0
  )

  // 3. 期日の古い順に並べ、原資を充当（FIFO）
  const order = [...planned].sort((a, b) => {
    if (a.plannedDate !== b.plannedDate)
      return a.plannedDate < b.plannedDate ? -1 : 1
    if (a.creditorId !== b.creditorId) return a.creditorId - b.creditorId
    return a.installmentNo - b.installmentNo
  })

  const paidById = new Map<number, number>()
  for (const inst of order) {
    if (pool <= 0) break
    const paid = Math.min(pool, inst.plannedAmount)
    if (paid <= 0) continue
    paidById.set(rowId(inst.creditorId, inst.installmentNo), paid)
    pool -= paid
  }

  // 4. PaymentRecord 化
  return order.map((inst) => {
    const id = rowId(inst.creditorId, inst.installmentNo)
    const paid = paidById.get(id) ?? null
    return {
      id,
      caseId: caseLevelPayments[0]?.caseId ?? creditors[0]?.caseId ?? 0,
      creditorId: inst.creditorId,
      creditorInstallmentIndex: inst.installmentNo,
      plannedDate: inst.plannedDate,
      plannedAmount: inst.plannedAmount,
      plannedFeeAllocation: null,
      plannedAgentFeeAllocation: null,
      plannedPoolAllocation: null,
      plannedRepaymentAllocation: inst.plannedAmount,
      actualDate: paid != null ? inst.plannedDate : null,
      actualAmount: paid,
      actualFeeAllocation: null,
      actualAgentFeeAllocation: null,
      actualPoolAllocation: null,
      actualRepaymentAllocation: paid,
      handlingFee: null,
      repaymentCount: null,
      repaymentDate: null,
      actualRepaymentCount: null,
      actualHandlingFee: null,
      cumulativePool: null,
    }
  })
}
