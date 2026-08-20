/**
 * 実データ移行 seed
 * scripts/generate_realdata_json.py が生成した JSON（全2,911件）を読み込み、
 * ネスト構造をフラットな Prisma 行に変換して一括投入する。
 *
 * 事前に: python3 scripts/generate_realdata_json.py
 * 実行:   npx prisma db seed   （package.json の prisma.seed に tsx 等を設定）
 *
 * データ位置は DATA_DIR で上書き可（既定: public/data）。
 *
 * ★ 2つのモードがある
 *   既定 (SEED_MODE 未設定)  … 全入れ替え。**破壊的**。
 *       TRUNCATE "payments","contact_histories","creditors","cases" RESTART IDENTITY CASCADE
 *       を実行するので、事務所が画面から入れた実入金・接触履歴・LINE連携が全部消える。
 *       本番運用が始まった後は実行しないこと。
 *   SEED_MODE=append        … 差分追加。TRUNCATE しない。
 *       kintone のレコード番号（または ID）で既にDBに居る案件は飛ばし、
 *       居ないものだけを追加する。id は採番済みの列と衝突しないようDBに振らせる。
 *       例) DATA_DIR=/tmp/knew SEED_MODE=append npx tsx prisma/seed.ts
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
    // 辞任日。ここに書き忘れると列だけできて中身が全件 null になる
    resignationDate: d(s.resignationDate),
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
    cumulativePlannedAgentFeeAllocation: p.cumulativePlannedAgentFeeAllocation ?? null,
    cumulativeAgentFeeAllocation: p.cumulativeAgentFeeAllocation ?? null,
    cumulativePlannedPoolAllocation: p.cumulativePlannedPoolAllocation ?? null,
    cumulativePlannedRepaymentAllocation: p.cumulativePlannedRepaymentAllocation ?? null,
    cumulativeHandlingFee: p.cumulativeHandlingFee ?? null,
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

/**
 * 差分追加モード。
 * 既にDBに居る案件（kintone のレコード番号、無ければ ID で判定）は飛ばし、
 * 残りだけを入れる。JSON側の id は連番なので使わず、DBに採番させる。
 */
async function appendOnly(
  cases: CaseJson[],
  creditors: any[],
  payments: any[],
  contacts: any[]
) {
  const existing = await prisma.case.findMany({
    select: { recordNumber: true, externalId: true },
  })
  const haveRn = new Set(existing.map((c) => c.recordNumber).filter((v) => v != null))
  const haveExt = new Set(
    existing.map((c) => (c.externalId ?? '').trim()).filter((v) => v !== '')
  )

  const isNew = (c: CaseJson) => {
    const rn = (c.clientBasicInfo as any).recordNumber as number | null
    const ext = String(((c.metadata as any).externalId ?? '')).trim()
    if (rn != null && haveRn.has(rn)) return false
    // レコード番号が無い場合だけ ID で見る（IDは事務所側で直されるため信頼度が低い）
    if (rn == null && ext && haveExt.has(ext)) return false
    return true
  }

  const targets = cases.filter(isNew)
  const skipped = cases.length - targets.length
  console.log(`追加対象 ${targets.length} 件（既にDBにある ${skipped} 件は飛ばします）`)
  if (targets.length === 0) return

  // JSON上の caseId → DBが採番した実 id
  const idMap = new Map<number, number>()
  for (const c of targets) {
    const { id: _localId, ...flat } = flattenCase(c)
    const created = await prisma.case.create({ data: flat, select: { id: true } })
    idMap.set(c.id, created.id)
    console.log(
      `  + ${(c.clientBasicInfo as any).recordNumber} / ` +
        `${(c.metadata as any).externalId} / ${(c.clientBasicInfo as any).name}` +
        ` → id ${created.id}`
    )
  }

  const mine = <T extends { caseId: number }>(rows: T[]) =>
    rows.filter((r) => idMap.has(r.caseId))

  const newCreditors = mine(creditors)
  console.log(`creditors: ${newCreditors.length}`)
  for (const part of chunk(
    newCreditors.map(({ id: _drop, ...c }) => ({
      ...c,
      caseId: idMap.get(c.caseId)!,
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

  const newPayments = mine(payments)
  console.log(`payments: ${newPayments.length}`)
  for (const part of chunk(
    // creditorId も JSON 上の連番なので、紐付けは持ち込まない（案件単位で足りる）
    newPayments.map(({ id: _drop, creditorId: _c, ...p }) => ({
      ...p,
      caseId: idMap.get(p.caseId)!,
      plannedDate: d(p.plannedDate),
      actualDate: d(p.actualDate),
      repaymentDate: d(p.repaymentDate),
    })),
    3000
  )) {
    await prisma.payment.createMany({ data: part })
  }

  const newContacts = mine(contacts)
  console.log(`contactHistories: ${newContacts.length}`)
  for (const part of chunk(
    newContacts.map((h) => ({
      caseId: idMap.get(h.caseId)!,
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

  console.log('done (append).')
}

async function main() {
  console.log('DATA_DIR =', DATA_DIR)

  const cases = read<CaseJson[]>('cases.json')
  const creditors = read<any[]>('creditors.json')
  const payments = read<any[]>('payments.json')
  const contacts = read<any[]>('contactHistories.json')

  if (process.env.SEED_MODE === 'append') {
    await appendOnly(cases, creditors, payments, contacts)
    return
  }

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
      repaymentDate: d(p.repaymentDate),
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
