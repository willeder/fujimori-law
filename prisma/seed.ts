/**
 * 実データ移行 seed
 * scripts/generate_realdata_json.py が生成した JSON（全2,911件）を読み込み、
 * ネスト構造をフラットな Prisma 行に変換して一括投入する。
 *
 * 事前に: python3 scripts/generate_realdata_json.py
 * 実行:   npx prisma db seed   （package.json の prisma.seed に tsx 等を設定）
 *
 * データ位置は DATA_DIR で上書き可（既定: public/data）。
 */
import { PrismaClient, ContactTarget } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const prisma = new PrismaClient()

const DATA_DIR =
  process.env.DATA_DIR ?? join(process.cwd(), 'public', 'data')

const read = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8')) as T

/** ISO 日付文字列 → Date（空は null） */
const d = (v: string | null | undefined): Date | null => (v ? new Date(v) : null)

/** 配列をチャンクに分割（createMany のパラメータ上限対策） */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

interface CaseJson {
  id: number
  clientBasicInfo: Record<string, unknown>
  appointmentInfo: Record<string, unknown>
  debtInfo: Record<string, unknown>
  settlementInfo: Record<string, unknown>
  feeInfo: Record<string, unknown>
  paymentInfo: Record<string, unknown>
  reminderInfo: Record<string, unknown>
  metadata: Record<string, unknown>
}

function flattenCase(c: CaseJson) {
  const b = c.clientBasicInfo as any
  const a = c.appointmentInfo as any
  const debt = c.debtInfo as any
  const s = c.settlementInfo as any
  const fee = c.feeInfo as any
  const p = c.paymentInfo as any
  const r = c.reminderInfo as any
  const m = c.metadata as any
  return {
    id: c.id,
    externalId: m.externalId ?? null,
    recordNumber: b.recordNumber ?? null,
    // 基本情報
    name: b.name ?? '（氏名未設定）',
    furigana: b.furigana ?? null,
    phone: b.phone ?? null,
    lineUrl: b.lineUrl ?? null,
    email: b.email ?? null,
    postalCode: b.postalCode ?? null,
    prefecture: b.prefecture ?? null,
    address: b.address ?? null,
    birthDate: d(b.birthDate),
    age: b.age ?? null,
    gender: b.gender ?? null,
    maritalStatus: b.maritalStatus ?? null,
    maidenName: b.maidenName ?? null,
    children: b.children ?? null,
    residenceType: b.residenceType ?? null,
    rent: b.rent ?? null,
    monthlyIncome: b.monthlyIncome ?? null,
    payDay: b.payDay ?? null,
    employmentType: b.employmentType ?? null,
    cautionRank: b.cautionRank ?? null,
    correspondenceRequired: b.correspondenceRequired ?? null,
    correspondenceHours: b.correspondenceHours ?? null,
    cohabitation: b.cohabitation ?? null,
    confidentialContact: b.confidentialContact ?? null,
    emergencyContact: b.emergencyContact ?? null,
    emergencyContactRelation: b.emergencyContactRelation ?? null,
    previousAddress: b.previousAddress ?? null,
    payrollAccount: b.payrollAccount ?? null,
    employerName: b.employerName ?? null,
    employerContact: b.employerContact ?? null,
    employerAddress: b.employerAddress ?? null,
    previousEmployerName: b.previousEmployerName ?? null,
    previousEmployerContact: b.previousEmployerContact ?? null,
    previousEmployerAddress: b.previousEmployerAddress ?? null,
    otherOfficeConsultation: b.otherOfficeConsultation ?? null,
    paymentDelay: b.paymentDelay ?? null,
    bicycleNote: b.bicycleNote ?? null,
    pension: b.pension ?? null,
    // アポ・面談
    appointmentStaff: a.appointmentStaff ?? null,
    followUpStaff: a.followUpStaff ?? null,
    interviewStaff: a.interviewStaff ?? null,
    judicialScrivener: a.judicialScrivener ?? null,
    debtAdjustmentType: a.debtAdjustmentType ?? null,
    acceptanceRank: a.acceptanceRank ?? null,
    acceptanceDate: d(a.acceptanceDate),
    elapsedDays: a.elapsedDays ?? null,
    cAcceptancePromotionDate: d(a.cAcceptancePromotionDate),
    interviewMemo1: a.interviewMemo1 ?? null,
    interviewMemo2: a.interviewMemo2 ?? null,
    incomeExpenseMemo: a.incomeExpenseMemo ?? null,
    // 債務
    creditorCount: debt.creditorCount ?? null,
    declaredDebtAmount: debt.declaredDebtAmount ?? null,
    totalDebtAmount: debt.totalDebtAmount ?? null,
    preRequestPayment: debt.preRequestPayment ?? null,
    postRequestPayment: debt.postRequestPayment ?? null,
    // 和解
    settlementStatus: s.status ?? null,
    settlementProposalDate: d(s.proposalDate),
    settlementCount: s.settlementCount ?? null,
    postSettlementPaymentCount: s.postSettlementPaymentCount ?? null,
    plannedPaymentCount: s.plannedPaymentCount ?? null,
    plannedAgentCount: s.plannedAgentCount ?? null,
    allSettlementDocSentDate: d(s.allSettlementDocSentDate),
    // 報酬
    normalFee: fee.normalFee ?? null,
    officeFee: fee.officeFee ?? null,
    installmentCount: fee.installmentCount ?? null,
    agentPayment: fee.agentPayment ?? null,
    plannedPaymentFeeTotal: fee.plannedPaymentFeeTotal ?? null,
    uncollectedFee: fee.uncollectedFee ?? null,
    // 入金サマリ
    firstPaymentDate: d(p.firstPaymentDate),
    firstPaymentWithinTenDays: p.firstPaymentWithinTenDays ?? null,
    firstPaymentAmount: p.firstPaymentAmount ?? null,
    monthlyPaymentDay: p.monthlyPaymentDay ?? null,
    basePaymentAmount: p.basePaymentAmount ?? null,
    nextPaymentDate: d(p.nextPaymentDate),
    cumulativePaymentAmount: p.cumulativePaymentAmount ?? null,
    cumulativePlannedPayment: p.cumulativePlannedPayment ?? null,
    cumulativeFeeAllocation: p.cumulativeFeeAllocation ?? null,
    cumulativePlannedFeeAllocation: p.cumulativePlannedFeeAllocation ?? null,
    cumulativePoolAllocation: p.cumulativePoolAllocation ?? null,
    cumulativeRepaymentAllocation: p.cumulativeRepaymentAllocation ?? null,
    totalMinusPoolMinusRepayment: p.totalMinusPoolMinusRepayment ?? null,
    notificationExcluded: p.notificationExcluded ?? null,
    vAccountBranch: p.vAccountBranch ?? null,
    vAccountNumber: p.vAccountNumber ?? null,
    // リマインド
    reminderDate: d(r.reminderDate),
    reminderTime: r.reminderTime ?? null,
    nextResponseDate: d(r.nextResponseDate),
    responseTime: r.responseTime ?? null,
    // メタ
    listCategory: m.listCategory ?? null,
    listRegisteredDate: d(m.listRegisteredDate),
    acceptanceDocs: m.acceptanceDocs ?? null,
    createdBy: m.createdBy ?? null,
    updatedBy: m.updatedBy ?? null,
    createdAt: d(m.createdAt) ?? new Date(),
    updatedAt: d(m.updatedAt) ?? new Date(),
  }
}

async function resetSequence(table: string) {
  // 明示 id 投入後、シーケンスを最大 id+1 に揃える
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`
  )
}

async function main() {
  console.log('DATA_DIR =', DATA_DIR)

  const cases = read<CaseJson[]>('cases.json')
  const creditors = read<any[]>('creditors.json')
  const payments = read<any[]>('payments.json')
  const contacts = read<any[]>('contactHistories.json')

  console.log('truncating...')
  await prisma.$executeRawUnsafe(
    'TRUNCATE "payments","contact_histories","creditors","cases" RESTART IDENTITY CASCADE'
  )

  // PostgreSQL は 1 クエリのバインドパラメータ上限が 65535。
  // 列数 × 行数がこれを超えないようバッチサイズを抑える。
  console.log(`cases: ${cases.length}`)
  for (const part of chunk(cases.map(flattenCase), 500)) {
    await prisma.case.createMany({ data: part })
  }

  console.log(`creditors: ${creditors.length}`)
  for (const part of chunk(
    creditors.map((c) => ({
      ...c,
      nextProcessDate: d(c.nextProcessDate),
      acceptanceNoticeSentDate: d(c.acceptanceNoticeSentDate),
      debtInquiryArrivalDate: d(c.debtInquiryArrivalDate),
      contractDate: d(c.contractDate),
      settlementProposalDate: d(c.settlementProposalDate),
      settlementDate: d(c.settlementDate),
    })),
    1000
  )) {
    await prisma.creditor.createMany({ data: part })
  }

  console.log(`payments: ${payments.length}`)
  for (const part of chunk(
    payments.map((p) => ({
      ...p,
      plannedDate: d(p.plannedDate),
      actualDate: d(p.actualDate),
    })),
    3000
  )) {
    await prisma.payment.createMany({ data: part })
  }

  console.log(`contactHistories: ${contacts.length}`)
  for (const part of chunk(
    contacts.map((h) => ({
      id: h.id,
      caseId: h.caseId,
      contactDate: d(h.contactDate),
      contactTime: h.contactTime ?? null,
      staff: h.staff ?? null,
      tool: h.tool ?? null,
      targetType:
        h.targetType === '債権者' ? ContactTarget.CREDITOR : ContactTarget.CLIENT,
      creditorName: h.creditorName ?? null,
      comment: h.comment ?? null,
    })),
    5000
  )) {
    await prisma.contactHistory.createMany({ data: part })
  }

  console.log('resetting sequences...')
  for (const t of ['cases', 'creditors', 'payments', 'contact_histories']) {
    await resetSequence(t)
  }

  console.log('done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
