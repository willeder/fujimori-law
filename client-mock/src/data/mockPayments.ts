/**
 * 入金予定履歴モック
 * - 案件全体行: docs/data/CSVファイル.csv を scripts/generate_mock_from_docs.py で取り込み
 * - 債権者別行: mockCreditors から生成（buildCreditorRepaymentSchedulesForCase）
 */
import type { Creditor, PaymentRecord } from '../types/case'
import { mockCasesFromDocs } from './mockCasesFromDocs'
import { getCreditorsByCaseId } from './mockCreditors'
import { mockPaymentRecordsFromDocs } from './mockPaymentsFromDocs'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parseYearMonth(ym: string): { y: number; m: number } {
  const [y, m] = ym.split('-').map((x) => Number(x))
  return { y, m }
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

function creditorRepaymentPlannedDates(c: Creditor, maxRows: number): string[] {
  if (!c.paymentStartMonth || c.paymentDay == null || !c.paymentCount) return []
  const { y, m } = parseYearMonth(c.paymentStartMonth)
  const n = Math.min(maxRows, c.paymentCount)
  const dates: string[] = []
  for (let i = 0; i < n; i++) {
    const { y: yy, m: mm } = addCalendarMonths(y, m, i)
    dates.push(formatYmd(yy, mm, c.paymentDay))
  }
  return dates
}

function installmentRepaymentAmount(c: Creditor, indexZeroBased: number): number {
  const n = c.paymentCount ?? 0
  if (n <= 0) return 0
  if (n === 1) {
    return c.firstPaymentAmount ?? c.finalPaymentAmount ?? 0
  }
  if (indexZeroBased === 0) return c.firstPaymentAmount ?? 0
  if (indexZeroBased === n - 1) {
    return c.finalPaymentAmount ?? c.subsequentPaymentAmount ?? 0
  }
  return c.subsequentPaymentAmount ?? 0
}

function creditorRepaymentRowId(creditorId: number, installmentNo: number): number {
  return 800_000 + creditorId * 500 + installmentNo
}

export interface BuildCreditorRepaymentOptions {
  maxInstallmentsPerCreditor: number
  paidInstallments: number
}

export function buildCreditorRepaymentSchedulesForCase(
  caseId: number,
  options: BuildCreditorRepaymentOptions
): PaymentRecord[] {
  const creditors = getCreditorsByCaseId(caseId)
  const out: PaymentRecord[] = []
  for (const c of creditors) {
    const pc = c.paymentCount ?? 0
    const maxRows = Math.min(options.maxInstallmentsPerCreditor, pc || 0)
    const dates = creditorRepaymentPlannedDates(c, maxRows)
    dates.forEach((plannedDate, i) => {
      const installmentNo = i + 1
      const amt = installmentRepaymentAmount(c, i)
      const paid = installmentNo <= options.paidInstallments
      out.push({
        id: creditorRepaymentRowId(c.id, installmentNo),
        caseId,
        creditorId: c.id,
        creditorInstallmentIndex: installmentNo,
        plannedDate,
        plannedAmount: amt,
        plannedFeeAllocation: null,
        plannedAgentFeeAllocation: null,
        plannedPoolAllocation: null,
        plannedRepaymentAllocation: amt,
        actualDate: paid ? plannedDate : null,
        actualAmount: paid ? amt : null,
        actualFeeAllocation: null,
        actualAgentFeeAllocation: null,
        actualPoolAllocation: null,
        actualRepaymentAllocation: paid ? amt : null,
        handlingFee: null,
        repaymentCount: null,
        cumulativePool: null,
      })
    })
  }
  return out
}

function scheduleOptionsForCase(caseId: number): BuildCreditorRepaymentOptions {
  const creditors = getCreditorsByCaseId(caseId)
  if (creditors.length === 0) {
    return { maxInstallmentsPerCreditor: 0, paidInstallments: 0 }
  }
  const maxPc = Math.max(
    0,
    ...creditors.map((c) => (typeof c.paymentCount === 'number' ? c.paymentCount : 0)),
  )
  const maxInst = Math.min(10, maxPc || 0)
  const paying = creditors.some((c) => c.status === '弁済中' || c.status === '和解済')
  const paid = paying ? Math.min(5, Math.max(0, Math.floor(maxInst / 2))) : 0
  return { maxInstallmentsPerCreditor: maxInst || 0, paidInstallments: paid }
}

const creditorScheduleRows = mockCasesFromDocs.flatMap((c) =>
  buildCreditorRepaymentSchedulesForCase(c.id, scheduleOptionsForCase(c.id)),
)

export const mockPaymentRecords: PaymentRecord[] = [
  ...mockPaymentRecordsFromDocs,
  ...creditorScheduleRows,
]

export function getPaymentRecordsByCaseId(caseId: number): PaymentRecord[] {
  return mockPaymentRecords.filter((p) => p.caseId === caseId)
}

export function getPendingPayments(caseId: number): PaymentRecord[] {
  return getPaymentRecordsByCaseId(caseId).filter((p) => p.actualDate === null)
}

export function getCompletedPayments(caseId: number): PaymentRecord[] {
  return getPaymentRecordsByCaseId(caseId).filter((p) => p.actualDate !== null)
}
