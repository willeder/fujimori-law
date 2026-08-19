/**
 * DB アクセス（サーバ専用）。Vite 開発サーバの API ミドルウェア（vite.config.ts）から
 * ssrLoadModule 経由で読み込まれる。クライアントバンドルには含まれない。
 *
 * DB のフラットな列を、client-mock が期待する JSON 形
 * （cases.json / creditors.json / payments.json / contactHistories.json と同一）に復元する。
 */
import { Prisma, PrismaClient } from '@prisma/client'
import {
  calculateDelayStats,
  detectPaymentDelays,
} from '../services/payment/delayDetection.js'
import { writeAudit, writeChange } from './audit.js'
import { parseFindCriterion, toIsoDate } from '../utils/findCriterion.js'

const g = globalThis as unknown as { __prisma?: PrismaClient }
const prisma = g.__prisma ?? new PrismaClient()
if (!g.__prisma) g.__prisma = prisma

const ds = (v: Date | null): string | null =>
  v ? v.toISOString().slice(0, 10) : null

function toCaseJson(c: Record<string, any>) {
  return {
    id: c.id,
    clientBasicInfo: {
      name: c.name,
      furigana: c.furigana,
      phone: c.phone,
      lineUrl: c.lineUrl,
      email: c.email,
      postalCode: c.postalCode,
      prefecture: c.prefecture,
      address: c.address,
      birthDate: ds(c.birthDate),
      age: c.age,
      gender: c.gender,
      maritalStatus: c.maritalStatus,
      maidenName: c.maidenName,
      children: c.children,
      residenceType: c.residenceType,
      rent: c.rent,
      monthlyIncome: c.monthlyIncome,
      payDay: c.payDay,
      employmentType: c.employmentType,
      cautionRank: c.cautionRank,
      recordNumber: c.recordNumber,
      correspondenceRequired: c.correspondenceRequired,
      correspondenceHours: c.correspondenceHours,
      cohabitation: c.cohabitation,
      confidentialContact: c.confidentialContact,
      emergencyContact: c.emergencyContact,
      emergencyContactRelation: c.emergencyContactRelation,
      previousAddress: c.previousAddress,
      payrollAccount: c.payrollAccount,
      employerName: c.employerName,
      employerContact: c.employerContact,
      employerAddress: c.employerAddress,
      previousEmployerName: c.previousEmployerName,
      previousEmployerContact: c.previousEmployerContact,
      previousEmployerAddress: c.previousEmployerAddress,
      otherOfficeConsultation: c.otherOfficeConsultation,
      paymentDelay: c.paymentDelay,
      bicycleNote: c.bicycleNote,
      pension: c.pension,
    },
    appointmentInfo: {
      appointmentStaff: c.appointmentStaff,
      followUpStaff: c.followUpStaff,
      interviewStaff: c.interviewStaff,
      judicialScrivener: c.judicialScrivener,
      debtAdjustmentType: c.debtAdjustmentType,
      acceptanceRank: c.acceptanceRank,
      acceptanceDate: ds(c.acceptanceDate),
      elapsedDays: c.elapsedDays,
      cAcceptancePromotionDate: ds(c.cAcceptancePromotionDate),
      interviewMemo1: c.interviewMemo1,
      interviewMemo2: c.interviewMemo2,
      incomeExpenseMemo: c.incomeExpenseMemo,
    },
    debtInfo: {
      creditorCount: c.creditorCount,
      declaredDebtAmount: c.declaredDebtAmount,
      totalDebtAmount: c.totalDebtAmount,
      preRequestPayment: c.preRequestPayment,
      postRequestPayment: c.postRequestPayment,
    },
    settlementInfo: {
      status: c.settlementStatus,
      proposalDate: ds(c.settlementProposalDate),
      settlementCount: c.settlementCount,
      postSettlementPaymentCount: c.postSettlementPaymentCount,
      plannedPaymentCount: c.plannedPaymentCount,
      plannedAgentCount: c.plannedAgentCount,
      allSettlementDocSentDate: ds(c.allSettlementDocSentDate),
      resignationDate: ds(c.resignationDate),
    },
    feeInfo: {
      normalFee: c.normalFee,
      officeFee: c.officeFee,
      installmentCount: c.installmentCount,
      agentPayment: c.agentPayment,
      plannedPaymentFeeTotal: c.plannedPaymentFeeTotal,
      uncollectedFee: c.uncollectedFee,
    },
    paymentInfo: {
      firstPaymentDate: ds(c.firstPaymentDate),
      firstPaymentWithinTenDays: c.firstPaymentWithinTenDays,
      firstPaymentAmount: c.firstPaymentAmount,
      monthlyPaymentDay: c.monthlyPaymentDay,
      basePaymentAmount: c.basePaymentAmount,
      nextPaymentDate: ds(c.nextPaymentDate),
      cumulativePaymentAmount: c.cumulativePaymentAmount,
      cumulativePlannedPayment: c.cumulativePlannedPayment,
      cumulativeFeeAllocation: c.cumulativeFeeAllocation,
      cumulativePlannedFeeAllocation: c.cumulativePlannedFeeAllocation,
      cumulativePoolAllocation: c.cumulativePoolAllocation,
      cumulativeRepaymentAllocation: c.cumulativeRepaymentAllocation,
      cumulativePlannedRepaymentAllocation: c.cumulativePlannedRepaymentAllocation,
      cumulativePlannedPoolAllocation: c.cumulativePlannedPoolAllocation,
      cumulativeAgentFeeAllocation: c.cumulativeAgentFeeAllocation,
      cumulativePlannedAgentFeeAllocation: c.cumulativePlannedAgentFeeAllocation,
      cumulativeHandlingFee: c.cumulativeHandlingFee,
      totalMinusPoolMinusRepayment: c.totalMinusPoolMinusRepayment,
      notificationExcluded: c.notificationExcluded,
      vAccountBranch: c.vAccountBranch,
      vAccountNumber: c.vAccountNumber,
    },
    reminderInfo: {
      reminderDate: ds(c.reminderDate),
      reminderTime: c.reminderTime,
      nextResponseDate: ds(c.nextResponseDate),
      responseTime: c.responseTime,
    },
    metadata: {
      createdAt: ds(c.createdAt),
      updatedAt: ds(c.updatedAt),
      // 楽観ロック（先勝ち保存）用の厳密な更新時刻（ミリ秒までのISO）
      updatedAtExact: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
      createdBy: c.createdBy,
      updatedBy: c.updatedBy,
      externalId: c.externalId,
      listCategory: c.listCategory,
      listRegisteredDate: ds(c.listRegisteredDate),
      acceptanceDocs: c.acceptanceDocs,
    },
  }
}

function toCreditorJson(c: Record<string, any>) {
  return {
    ...c,
    nextProcessDate: ds(c.nextProcessDate),
    acceptanceNoticeSentDate: ds(c.acceptanceNoticeSentDate),
    debtInquiryArrivalDate: ds(c.debtInquiryArrivalDate),
    contractDate: ds(c.contractDate),
    settlementProposalDate: ds(c.settlementProposalDate),
    settlementDate: ds(c.settlementDate),
  }
}

function toPaymentJson(p: Record<string, any>) {
  return {
    ...p,
    plannedDate: ds(p.plannedDate),
    actualDate: ds(p.actualDate),
    repaymentDate: ds(p.repaymentDate),
  }
}

function toContactJson(h: Record<string, any>) {
  const { createdAt: _omit, ...rest } = h
  return {
    ...rest,
    contactDate: ds(h.contactDate),
    targetType: h.targetType === 'CREDITOR' ? '債権者' : '依頼者',
  }
}

export async function getCases() {
  const rows = await prisma.case.findMany({ orderBy: { id: 'asc' } })
  return rows.map(toCaseJson)
}

/** 一覧/ダッシュボードが使う項目だけのサマリ（フル案件は詳細で個別取得） */
function toCaseSummaryJson(c: Record<string, any>) {
  return {
    id: c.id,
    clientBasicInfo: {
      name: c.name,
      furigana: c.furigana,
      phone: c.phone,
      lineUrl: c.lineUrl,
      prefecture: c.prefecture,
      payDay: c.payDay,
      cautionRank: c.cautionRank,
      recordNumber: c.recordNumber,
      age: c.age,
      birthDate: ds(c.birthDate),
      paymentDelay: c.paymentDelay,
      bicycleNote: c.bicycleNote,
      pension: c.pension,
    },
    appointmentInfo: {
      acceptanceDate: ds(c.acceptanceDate),
      acceptanceRank: c.acceptanceRank,
      debtAdjustmentType: c.debtAdjustmentType,
      appointmentStaff: c.appointmentStaff,
      interviewStaff: c.interviewStaff,
      judicialScrivener: c.judicialScrivener,
      elapsedDays: c.elapsedDays,
      cAcceptancePromotionDate: ds(c.cAcceptancePromotionDate),
    },
    debtInfo: {
      creditorCount: c.creditorCount,
      declaredDebtAmount: c.declaredDebtAmount,
      preRequestPayment: c.preRequestPayment,
      postRequestPayment: c.postRequestPayment,
    },
    settlementInfo: {
      status: c.settlementStatus,
      proposalDate: ds(c.settlementProposalDate),
      postSettlementPaymentCount: c.postSettlementPaymentCount,
      resignationDate: ds(c.resignationDate),
    },
    feeInfo: {
      officeFee: c.officeFee,
      uncollectedFee: c.uncollectedFee,
      plannedPaymentFeeTotal: c.plannedPaymentFeeTotal,
      installmentCount: c.installmentCount,
    },
    paymentInfo: {
      nextPaymentDate: ds(c.nextPaymentDate),
      monthlyPaymentDay: c.monthlyPaymentDay,
      firstPaymentWithinTenDays: c.firstPaymentWithinTenDays,
      basePaymentAmount: c.basePaymentAmount,
      vAccountBranch: c.vAccountBranch,
      vAccountNumber: c.vAccountNumber,
      cumulativePlannedPayment: c.cumulativePlannedPayment,
      cumulativePaymentAmount: c.cumulativePaymentAmount,
      cumulativePlannedFeeAllocation: c.cumulativePlannedFeeAllocation,
      cumulativeFeeAllocation: c.cumulativeFeeAllocation,
      cumulativePlannedAgentFeeAllocation: c.cumulativePlannedAgentFeeAllocation,
      cumulativeAgentFeeAllocation: c.cumulativeAgentFeeAllocation,
      cumulativePlannedPoolAllocation: c.cumulativePlannedPoolAllocation,
      cumulativePoolAllocation: c.cumulativePoolAllocation,
      cumulativePlannedRepaymentAllocation: c.cumulativePlannedRepaymentAllocation,
      cumulativeRepaymentAllocation: c.cumulativeRepaymentAllocation,
      cumulativeHandlingFee: c.cumulativeHandlingFee,
    },
    reminderInfo: {
      reminderDate: ds(c.reminderDate),
      nextResponseDate: ds(c.nextResponseDate),
    },
    metadata: {
      externalId: c.externalId,
      listCategory: c.listCategory,
      listRegisteredDate: ds(c.listRegisteredDate),
      lineLinked: c.lineLink?.status === 'LINKED',
    },
  }
}

const CASE_SUMMARY_SELECT = {
  id: true,
  externalId: true,
  name: true,
  furigana: true,
  phone: true,
  lineUrl: true,
  prefecture: true,
  payDay: true,
  cautionRank: true,
  acceptanceDate: true,
  acceptanceRank: true,
  debtAdjustmentType: true,
  appointmentStaff: true,
  interviewStaff: true,
  judicialScrivener: true,
  creditorCount: true,
  declaredDebtAmount: true,
  settlementStatus: true,
  officeFee: true,
  uncollectedFee: true,
  // 「報酬・弁代・プールチェック」用の金額列（一覧の追加表示に使う）
  plannedPaymentFeeTotal: true,
  cumulativePlannedFeeAllocation: true,
  cumulativePlannedAgentFeeAllocation: true,
  cumulativePlannedPoolAllocation: true,
  cumulativeHandlingFee: true,
  nextPaymentDate: true,
  reminderDate: true,
  listCategory: true,
  listRegisteredDate: true,
  // kintone の各ビュー（保存した絞り込み）で列に出せるようにする項目。
  // ここに入れ忘れると一覧の列が全行 "-" になるので、列を足したら必ず追加する。
  recordNumber: true,
  age: true,
  birthDate: true,
  paymentDelay: true,
  bicycleNote: true,
  pension: true,
  elapsedDays: true,
  cAcceptancePromotionDate: true,
  preRequestPayment: true,
  postRequestPayment: true,
  settlementProposalDate: true,
  postSettlementPaymentCount: true,
  resignationDate: true,
  installmentCount: true,
  monthlyPaymentDay: true,
  firstPaymentWithinTenDays: true,
  basePaymentAmount: true,
  vAccountBranch: true,
  vAccountNumber: true,
  cumulativePlannedPayment: true,
  cumulativePaymentAmount: true,
  cumulativeFeeAllocation: true,
  cumulativeAgentFeeAllocation: true,
  cumulativePoolAllocation: true,
  cumulativePlannedRepaymentAllocation: true,
  cumulativeRepaymentAllocation: true,
  nextResponseDate: true,
  lineLink: { select: { status: true } },
} as const

export async function getCasesSummary() {
  const rows = await prisma.case.findMany({
    orderBy: { id: 'asc' },
    select: CASE_SUMMARY_SELECT,
  })
  return rows.map(toCaseSummaryJson)
}

// ── 横断検索（複数条件AND・ほぼ全フィールド・すべて部分一致） ──────────
const CASE_SEARCH_TYPE = buildFieldType('Case', [])

/**
 * 比較式（>=, <=, >, <, =, a..b）対応の WHERE 句を組み立てる共通処理。
 * 列の型（DMMF）に合う比較式のときだけ比較SQLを返し、それ以外は null（→ILIKE部分一致へ）。
 * 列名はホワイトリスト検証済みの前提。値はすべてパラメータ化。
 */
function buildCompareWhere(
  colExpr: string,
  fieldType: string,
  value: string,
  params: (string | number)[]
): string | null {
  const crit = parseFindCriterion(value)
  if (!crit) return null
  const isNum = fieldType === 'Int' || fieldType === 'Float' || fieldType === 'Decimal' || fieldType === 'BigInt'
  const isDate = fieldType === 'DateTime'
  if ((crit.kind === 'num' || crit.kind === 'num-range') && isNum) {
    if (crit.kind === 'num-range') {
      params.push(crit.n, crit.n2)
      return `${colExpr} BETWEEN $${params.length - 1} AND $${params.length}`
    }
    params.push(crit.n)
    return `${colExpr} ${crit.op} $${params.length}`
  }
  if ((crit.kind === 'date' || crit.kind === 'date-range') && isDate) {
    if (crit.kind === 'date-range') {
      params.push(crit.d, crit.d2)
      return `CAST(${colExpr} AS DATE) BETWEEN $${params.length - 1}::date AND $${params.length}::date`
    }
    params.push(crit.d)
    return `CAST(${colExpr} AS DATE) ${crit.op} $${params.length}::date`
  }
  return null
}

// ── 日付の相対指定（今日・今月・N日前後）を「開始日〜終了日」に解決する ──────
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}
/** 週は月曜はじまりとして扱う */
function weekRange(base: Date, offsetWeeks: number): { from: string; to: string } {
  const d = addDays(base, offsetWeeks * 7)
  const dow = (d.getUTCDay() + 6) % 7 // 月曜=0
  const start = addDays(d, -dow)
  return { from: isoDate(start), to: isoDate(addDays(start, 6)) }
}
function monthRange(base: Date, offsetMonths: number): { from: string; to: string } {
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth() + offsetMonths
  const start = new Date(Date.UTC(y, m, 1))
  const end = new Date(Date.UTC(y, m + 1, 0))
  return { from: isoDate(start), to: isoDate(end) }
}
function yearRange(base: Date, offsetYears: number): { from: string; to: string } {
  const y = base.getUTCFullYear() + offsetYears
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

/**
 * 日付値を期間に解決する。
 * 絶対日付（2026-07-29）は from=to のその日。相対トークンはその期間全体。
 * 解決できなければ null。
 */
export function resolveDateValue(
  value: string,
  now: Date = new Date()
): { from: string; to: string } | null {
  const v = (value ?? '').trim()
  if (!v) return null
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  switch (v) {
    case 'TODAY':
      return { from: isoDate(today), to: isoDate(today) }
    case 'YESTERDAY':
      return { from: isoDate(addDays(today, -1)), to: isoDate(addDays(today, -1)) }
    case 'TOMORROW':
      return { from: isoDate(addDays(today, 1)), to: isoDate(addDays(today, 1)) }
    case 'THIS_WEEK':
      return weekRange(today, 0)
    case 'LAST_WEEK':
      return weekRange(today, -1)
    case 'NEXT_WEEK':
      return weekRange(today, 1)
    case 'THIS_MONTH':
      return monthRange(today, 0)
    case 'LAST_MONTH':
      return monthRange(today, -1)
    case 'NEXT_MONTH':
      return monthRange(today, 1)
    case 'THIS_YEAR':
      return yearRange(today, 0)
    case 'LAST_YEAR':
      return yearRange(today, -1)
    case 'NEXT_YEAR':
      return yearRange(today, 1)
  }

  const rel = /^FROM_TODAY:(-?\d+):(DAYS|WEEKS|MONTHS|YEARS)$/.exec(v)
  if (rel) {
    const n = Number(rel[1])
    const unit = rel[2]
    if (unit === 'DAYS') {
      const d = isoDate(addDays(today, n))
      return { from: d, to: d }
    }
    if (unit === 'WEEKS') {
      const d = isoDate(addDays(today, n * 7))
      return { from: d, to: d }
    }
    if (unit === 'MONTHS') {
      const d = new Date(today)
      d.setUTCMonth(d.getUTCMonth() + n)
      return { from: isoDate(d), to: isoDate(d) }
    }
    const d = new Date(today)
    d.setUTCFullYear(d.getUTCFullYear() + n)
    return { from: isoDate(d), to: isoDate(d) }
  }

  const abs = toIsoDate(v)
  if (abs) return { from: abs, to: abs }
  return null
}

type NewCondition = { field: string; operator?: string; values?: string[]; value?: string }

const COMPARE_SQL: Record<string, string> = {
  eq: '=',
  ne: '<>',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
}

/**
 * 新形式の条件（演算子つき）を WHERE 句にする。
 * 列名はホワイトリスト検証済みの前提。値はすべてパラメータ化する。
 * 組み立てられない条件は null（呼び出し側で無視）。
 */
export function buildConditionWhere(
  cond: NewCondition,
  params: (string | number)[]
): string | null {
  const field = cond.field
  const op = cond.operator ?? ''
  const values = (cond.values ?? []).map((v) => String(v ?? '').trim())
  const filled = values.filter((v) => v !== '')

  // 債権者の支払開始日（リレーション）。
  // 列は文字列 'YYYY-MM-DD' で保持しているため、日付として比較できる形に揃えて比べる。
  // 「弁代代行対象」のように "支払開始月が◯◯以前で、かつ空でない債権者を持つ案件" を引く。
  if (field === 'creditorPaymentStartMonth') {
    const col = `cr."paymentStartMonth"`
    const notEmptyCol = `${col} IS NOT NULL AND ${col} <> ''`
    const wrap = (extra: string) =>
      `EXISTS (SELECT 1 FROM creditors cr WHERE cr."caseId" = c.id AND ${notEmptyCol}${extra})`
    if (op === 'empty') return `NOT ${wrap('')}`
    if (op === 'notEmpty') return wrap('')
    if (filled.length === 0) return null
    if (op === 'between' && filled.length >= 2) {
      params.push(filled[0], filled[1])
      return wrap(
        ` AND ${col}::date BETWEEN $${params.length - 1}::date AND $${params.length}::date`
      )
    }
    const CMP: Record<string, string> = {
      lte: '<=',
      lt: '<',
      gte: '>=',
      gt: '>',
      eq: '=',
      ne: '<>',
    }
    const cmp = CMP[op] ?? '='
    params.push(filled[0])
    return wrap(` AND ${col}::date ${cmp} $${params.length}::date`)
  }

  // 入金明細の実入金日（リレーション）。
  // 「昨日以降に入金があった案件」のように、取込直後の確認で使う。
  // 相対指定（今日・昨日・今月…）にも対応する。対象は案件全体行のみ
  // （債権者別の弁済予定は表示時に生成する別物なので除く）。
  if (
    field === 'paymentActualDate' ||
    field === 'paymentPlannedDate' ||
    field === 'paymentRepaymentDate'
  ) {
    const col =
      field === 'paymentActualDate'
        ? `p."actualDate"`
        : field === 'paymentPlannedDate'
          ? `p."plannedDate"`
          : `p."repaymentDate"`
    const wrap = (extra: string) =>
      `EXISTS (SELECT 1 FROM payments p WHERE p."caseId" = c.id AND p."creditorId" IS NULL${extra})`
    if (op === 'empty') return `NOT ${wrap(` AND ${col} IS NOT NULL`)}`
    if (op === 'notEmpty') return wrap(` AND ${col} IS NOT NULL`)
    if (filled.length === 0) return null
    const range = resolveDateValue(filled[0])
    if (!range) return null
    if (op === 'between' && filled.length >= 2) {
      const r2 = resolveDateValue(filled[1])
      if (!r2) return null
      params.push(range.from, r2.to)
      return wrap(
        ` AND CAST(${col} AS DATE) BETWEEN $${params.length - 1}::date AND $${params.length}::date`
      )
    }
    // 相対トークンは期間になるため、比較の向きに合わせて端を使う
    if (op === 'gte' || op === 'gt') {
      params.push(op === 'gte' ? range.from : range.to)
      return wrap(` AND CAST(${col} AS DATE) ${op === 'gte' ? '>=' : '>'} $${params.length}::date`)
    }
    if (op === 'lte' || op === 'lt') {
      params.push(op === 'lte' ? range.to : range.from)
      return wrap(` AND CAST(${col} AS DATE) ${op === 'lte' ? '<=' : '<'} $${params.length}::date`)
    }
    params.push(range.from, range.to)
    const inRange = ` AND CAST(${col} AS DATE) BETWEEN $${params.length - 1}::date AND $${params.length}::date`
    return op === 'ne' ? `NOT ${wrap(inRange)}` : wrap(inRange)
  }

  // 入金明細の「額」欄（kintone の入金情報テーブル）。
  // 入金予定額と実入金額が食い違う行に「額違」が入る計算項目なので、
  // こちらでは予定額と実入金額を直接突き合わせて同じ意味にする。
  if (field === 'paymentAmountMismatch') {
    const exists =
      `EXISTS (SELECT 1 FROM payments p WHERE p."caseId" = c.id AND p."creditorId" IS NULL` +
      ` AND p."actualAmount" IS NOT NULL` +
      ` AND COALESCE(p."plannedAmount", 0) <> COALESCE(p."actualAmount", 0))`
    // 「差異あり」＝そういう行がある / 「差異なし」「空である」＝1行も無い
    if (op === 'empty' || op === 'notIn' || op === 'notContains') return `NOT ${exists}`
    if (op === 'notEmpty' || filled.length === 0) return exists
    const wantsMismatch = filled.some((v) => v.includes('あり') || v === '額違')
    return wantsMismatch ? exists : `NOT ${exists}`
  }

  // 入金明細の「確認」欄（kintone の入金情報テーブル）。
  // 弁済充当予定額と弁済充当額が食い違う行に「違」が入る計算項目。
  // 元CSVで照合したところ 147,217行／45,229行が完全に一致したので、
  // こちらでは予定と実績を直接突き合わせて同じ意味にする。
  if (field === 'paymentRepaymentMismatch') {
    const exists =
      `EXISTS (SELECT 1 FROM payments p WHERE p."caseId" = c.id AND p."creditorId" IS NULL` +
      ` AND COALESCE(p."plannedRepaymentAllocation", 0) <> COALESCE(p."actualRepaymentAllocation", 0))`
    if (op === 'empty' || op === 'notIn' || op === 'notContains') return `NOT ${exists}`
    if (op === 'notEmpty' || filled.length === 0) return exists
    const wantsMismatch = filled.some((v) => v.includes('あり') || v === '違')
    return wantsMismatch ? exists : `NOT ${exists}`
  }

  // 債権者別ステータス（リレーション）。
  // 案件の「受任後ステータス」とは別で、債権者1社ごとの進捗。
  // 「受任通知発送待ちの債権者を1社でも持つ案件」のような絞り込みに使う。
  // 債権者の「回答状況」「弁済対象」で案件を絞る（1社でも該当すればヒット）
  if (field === 'creditorResponseStatus' || field === 'creditorRepaymentTarget') {
    const col = field === 'creditorResponseStatus' ? 'responseStatus' : 'repaymentTarget'
    const anyVal = `EXISTS (SELECT 1 FROM creditors cr WHERE cr."caseId" = c.id AND COALESCE(cr."${col}", '') <> '')`
    if (op === 'empty') return `NOT ${anyVal}`
    if (op === 'notEmpty') return anyVal
    if (filled.length === 0) return null
    const ph = filled
      .map((v) => {
        params.push(v)
        return `$${params.length}`
      })
      .join(', ')
    const exists = `EXISTS (SELECT 1 FROM creditors cr WHERE cr."caseId" = c.id AND cr."${col}" IN (${ph}))`
    return op === 'notIn' || op === 'notContains' || op === 'ne' ? `NOT ${exists}` : exists
  }

  if (field === 'creditorStatus') {
    const anyStatus = `EXISTS (SELECT 1 FROM creditors cr WHERE cr."caseId" = c.id AND COALESCE(cr."status", '') <> '')`
    if (op === 'empty') return `NOT ${anyStatus}`
    if (op === 'notEmpty') return anyStatus
    if (filled.length === 0) return null
    const placeholders = filled
      .map((v) => {
        params.push(v)
        return `$${params.length}`
      })
      .join(', ')
    const exists = `EXISTS (SELECT 1 FROM creditors cr WHERE cr."caseId" = c.id AND cr."status" IN (${placeholders}))`
    return op === 'notIn' || op === 'notContains' || op === 'ne' ? `NOT ${exists}` : exists
  }

  // 債権者の CHECK（リレーション）。
  // kintone の「和解対象債権一覧」テーブル内の CHECK 欄で、チェック済みは "1" が入る。
  // 案件一覧では「CHECK が付いた債権者を持つ案件」を絞り込むために使う。
  if (field === 'creditorCheck') {
    const exists = `EXISTS (SELECT 1 FROM creditors cr WHERE cr."caseId" = c.id AND COALESCE(cr."check", '') <> '')`
    // 「いずれかを含む: CHECK」＝チェックあり、「空である」＝チェックなし
    if (op === 'empty' || op === 'notIn' || op === 'notContains') return `NOT ${exists}`
    if (op === 'notEmpty' || filled.length === 0) return exists
    // 値が指定されている場合（"CHECK" / "--"）は、その意味に読み替える
    const wantsChecked = filled.some((v) => v !== '--' && v !== '')
    return wantsChecked ? exists : `NOT ${exists}`
  }

  // 債権者名（リレーション）
  if (field === 'creditorName') {
    if (filled.length === 0) return null
    params.push(`%${filled[0]}%`)
    const exists = `EXISTS (SELECT 1 FROM creditors cr WHERE cr."caseId" = c.id AND cr."creditorName" ILIKE $${params.length})`
    return op === 'notContains' ? `NOT ${exists}` : exists
  }

  // 電話番号（数字のみに正規化して照合）
  if (field === 'phone') {
    const col = `regexp_replace(COALESCE(c."phone", ''), '[^0-9]', '', 'g')`
    if (op === 'empty') return `COALESCE(c."phone", '') = ''`
    if (op === 'notEmpty') return `COALESCE(c."phone", '') <> ''`
    if (filled.length === 0) return null
    params.push(`%${filled[0].replace(/\D/g, '')}%`)
    return op === 'notContains' ? `${col} NOT ILIKE $${params.length}` : `${col} ILIKE $${params.length}`
  }

  const type = CASE_SEARCH_TYPE[field]
  if (!type) return null // ホワイトリスト外
  const col = `c."${field}"`
  const isNum = type === 'Int' || type === 'Float' || type === 'Decimal' || type === 'BigInt'
  const isDate = type === 'DateTime'

  if (op === 'empty') return `(${col} IS NULL${isNum || isDate ? '' : ` OR ${col} = ''`})`
  if (op === 'notEmpty')
    return `(${col} IS NOT NULL${isNum || isDate ? '' : ` AND ${col} <> ''`})`

  if (filled.length === 0) return null

  // 選択肢の複数選択
  if (op === 'in' || op === 'notIn') {
    const holes = filled.map((v) => {
      params.push(v)
      return `$${params.length}`
    })
    const inSql = `CAST(${col} AS TEXT) IN (${holes.join(', ')})`
    // notIn は「値が入っていない（NULL）」も対象に含める（kintone の挙動に合わせる）
    return op === 'in' ? inSql : `(${col} IS NULL OR NOT ${inSql})`
  }

  // 日付
  if (isDate) {
    const dateCol = `CAST(${col} AS DATE)`
    if (op === 'between') {
      const a = resolveDateValue(filled[0])
      const b = resolveDateValue(filled[1] ?? filled[0])
      if (!a || !b) return null
      params.push(a.from, b.to)
      return `${dateCol} BETWEEN $${params.length - 1}::date AND $${params.length}::date`
    }
    const r = resolveDateValue(filled[0])
    if (!r) return null
    switch (op) {
      case 'eq':
        params.push(r.from, r.to)
        return `${dateCol} BETWEEN $${params.length - 1}::date AND $${params.length}::date`
      case 'ne':
        params.push(r.from, r.to)
        return `(${col} IS NULL OR ${dateCol} NOT BETWEEN $${params.length - 1}::date AND $${params.length}::date)`
      case 'gte':
        params.push(r.from)
        return `${dateCol} >= $${params.length}::date`
      case 'gt':
        params.push(r.to)
        return `${dateCol} > $${params.length}::date`
      case 'lte':
        params.push(r.to)
        return `${dateCol} <= $${params.length}::date`
      case 'lt':
        params.push(r.from)
        return `${dateCol} < $${params.length}::date`
      default:
        return null
    }
  }

  // 数値
  if (isNum) {
    const toNum = (s: string) => Number(s.replace(/[,，\s円]/g, ''))
    if (op === 'between') {
      const a = toNum(filled[0])
      const b = toNum(filled[1] ?? filled[0])
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null
      params.push(Math.min(a, b), Math.max(a, b))
      return `${col} BETWEEN $${params.length - 1} AND $${params.length}`
    }
    const n = toNum(filled[0])
    if (!Number.isFinite(n)) return null
    const sql = COMPARE_SQL[op]
    if (!sql) return null
    params.push(n)
    // ne は NULL も「等しくない」として扱う
    return op === 'ne'
      ? `(${col} IS NULL OR ${col} <> $${params.length})`
      : `${col} ${sql} $${params.length}`
  }

  // 文字列
  switch (op) {
    case 'contains':
      params.push(`%${filled[0]}%`)
      return `CAST(${col} AS TEXT) ILIKE $${params.length}`
    case 'notContains':
      params.push(`%${filled[0]}%`)
      return `(${col} IS NULL OR CAST(${col} AS TEXT) NOT ILIKE $${params.length})`
    case 'eq':
      params.push(filled[0])
      return `CAST(${col} AS TEXT) = $${params.length}`
    case 'ne':
      params.push(filled[0])
      return `(${col} IS NULL OR CAST(${col} AS TEXT) <> $${params.length})`
    default:
      return null
  }
}

/**
 * 旧形式の条件（値に記法を書く方式）を WHERE 句にする。既存の検索モード・検索履歴用。
 */
function buildLegacyWhere(
  cond: { field: string; value: string },
  params: (string | number)[]
): string | null {
  const v = (cond?.value ?? '').trim()
  if (!v) return null
  if (cond.field === 'creditorName') {
    params.push(`%${v}%`)
    return `EXISTS (SELECT 1 FROM creditors cr WHERE cr."caseId" = c.id AND cr."creditorName" ILIKE $${params.length})`
  }
  if (cond.field === 'phone') {
    params.push(`%${v.replace(/\D/g, '')}%`)
    return `regexp_replace(COALESCE(c."phone", ''), '[^0-9]', '', 'g') ILIKE $${params.length}`
  }
  const type = CASE_SEARCH_TYPE[cond.field]
  if (!type) return null // ホワイトリスト外は無視（列名はここで検証）
  const compared = buildCompareWhere(`c."${cond.field}"`, type, v, params)
  if (compared) return compared
  params.push(`%${v}%`)
  return `CAST(c."${cond.field}" AS TEXT) ILIKE $${params.length}`
}

/**
 * 複数条件の横断検索。条件: { field, value }[]（旧）または
 * { field, operator, values }[]（新・演算子つき）。`logic` で AND / OR を切り替える。
 *
 * 旧形式（value に記法を書く方式）:
 *   - 比較式（>=100000 / <=2026-06-30 / 100000..200000 / 2026-04-01..2026-06-30 等）
 *     → 数値列・日付列は型に合わせた比較で検索（検索モードのインライン検索と同一記法）
 *   - それ以外はすべての列をテキスト化して **部分一致（ILIKE・大小無視）** で検索
 * 新形式:
 *   - contains / notContains / eq / ne / in / notIn / gt / lt / gte / lte / between / empty / notEmpty
 *   - 日付は相対指定（TODAY・THIS_MONTH・FROM_TODAY:-7:DAYS 等）も可
 * 共通:
 *   - 電話番号     → 数字のみ正規化して含む検索（ハイフン無視・下4桁可）
 *   - creditorName → 債権者リレーションの含む検索
 * 列名はホワイトリスト（DMMF由来）済みのみ使用し、値はパラメータ化（インジェクション対策）。
 */
export async function searchCases(raw: string) {
  let conditions: NewCondition[] = []
  let logic: 'AND' | 'OR' = 'AND'
  try {
    const body = JSON.parse(raw || '{}') as {
      conditions?: NewCondition[]
      logic?: string
    }
    conditions = body.conditions ?? []
    if (String(body.logic ?? '').toLowerCase() === 'or') logic = 'OR'
  } catch {
    return { error: 'bad request' }
  }
  const wheres: string[] = []
  const params: (string | number)[] = []
  for (const cond of conditions) {
    if (!cond || typeof cond.field !== 'string') continue
    // operator があれば新形式、無ければ従来どおり value を解釈する
    const where = cond.operator
      ? buildConditionWhere(cond, params)
      : buildLegacyWhere({ field: cond.field, value: cond.value ?? '' }, params)
    if (where) wheres.push(where)
  }

  const sql = `SELECT c.id FROM cases c${
    wheres.length ? ' WHERE ' + wheres.join(` ${logic} `) : ''
  } ORDER BY c.id ASC LIMIT 5000`
  const idRows = await prisma.$queryRawUnsafe<{ id: number }[]>(sql, ...params)
  const ids = idRows.map((r) => r.id)
  if (ids.length === 0) return []
  const rows = await prisma.case.findMany({
    where: { id: { in: ids } },
    orderBy: { id: 'asc' },
    select: CASE_SUMMARY_SELECT,
  })
  return rows.map(toCaseSummaryJson)
}

/**
 * 債権者をDB全体から横断検索（案件をまたいで該当する債権者一覧を返す）。
 * 案件詳細の債権者タブで「ポケット」等を検索すると、全クライアントの該当債権者を返す用途。
 * 条件は { field, value }[]。field は Creditor のスカラー列（creditorName 等）をホワイトリスト検証。
 */
export async function searchCreditors(raw: string) {
  let conditions: { field: string; value: string }[] = []
  try {
    const body = JSON.parse(raw || '{}') as { conditions?: { field: string; value: string }[] }
    conditions = body.conditions ?? []
  } catch {
    return { error: 'bad request' }
  }
  const wheres: string[] = []
  const params: (string | number)[] = []
  for (const cond of conditions) {
    const v = (cond?.value ?? '').trim()
    if (!v) continue
    // Creditor のスカラー列のみ許可（列名の検証）
    const type = CREDITOR_FIELD_TYPE[cond.field]
    if (!type) continue
    const compared = buildCompareWhere(`cr."${cond.field}"`, type, v, params)
    if (compared) {
      wheres.push(compared)
      continue
    }
    params.push(`%${v}%`)
    wheres.push(`CAST(cr."${cond.field}" AS TEXT) ILIKE $${params.length}`)
  }
  if (wheres.length === 0) return []
  const sql = `SELECT cr.id FROM creditors cr WHERE ${wheres.join(' AND ')} ORDER BY cr.id ASC LIMIT 5000`
  const idRows = await prisma.$queryRawUnsafe<{ id: number }[]>(sql, ...params)
  const ids = idRows.map((r) => r.id)
  if (ids.length === 0) return []
  const rows = await prisma.creditor.findMany({
    where: { id: { in: ids } },
    orderBy: { id: 'asc' },
  })
  return rows.map(toCreditorJson)
}

/** 案件1件のフルデータ（詳細ページ用） */
export async function getCaseById(id: number) {
  const c = await prisma.case.findUnique({ where: { id } })
  return c ? toCaseJson(c) : null
}

// ── 案件編集の永続化・変更履歴・revert ──────────────────
// Prisma の DMMF から「編集可能なスカラー列 → 型」を自動取得（手書きの列リストを避け安全に）
const caseModel = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Case')
const CASE_FIELD_TYPE: Record<string, string> = {}
if (caseModel) {
  for (const f of caseModel.fields) {
    if (
      f.kind === 'scalar' &&
      !f.isId &&
      !f.isList &&
      f.name !== 'createdAt' &&
      f.name !== 'updatedAt'
    ) {
      CASE_FIELD_TYPE[f.name] = f.type // 'String' | 'Int' | 'DateTime' | 'Boolean'
    }
  }
}

/** 任意モデルの「編集可能なスカラー列 → 型」を DMMF から取得（FK・PK・時刻は除外） */
function buildFieldType(modelName: string, exclude: string[]): Record<string, string> {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === modelName)
  const out: Record<string, string> = {}
  if (m) {
    for (const f of m.fields) {
      if (
        f.kind === 'scalar' &&
        !f.isId &&
        !f.isList &&
        f.name !== 'createdAt' &&
        f.name !== 'updatedAt' &&
        !exclude.includes(f.name)
      ) {
        out[f.name] = f.type
      }
    }
  }
  return out
}
const CREDITOR_FIELD_TYPE = buildFieldType('Creditor', ['caseId'])
const PAYMENT_FIELD_TYPE = buildFieldType('Payment', ['caseId', 'creditorId'])
const CONTACT_FIELD_TYPE = buildFieldType('ContactHistory', ['caseId'])

/** 表示値（文字列等）→ DB 値に型変換 */
function caseToDb(type: string, value: unknown): unknown {
  if (value === '' || value === null || value === undefined) return null
  if (type === 'Int') {
    const n = Number(value)
    return Number.isFinite(n) ? Math.trunc(n) : null
  }
  if (type === 'DateTime') {
    const d = new Date(String(value))
    return isNaN(d.getTime()) ? null : d
  }
  if (type === 'Boolean') return value === true || value === 'true' || value === 1
  return String(value)
}

/** DB 値 → 表示値（変更履歴スナップショット用） */
function caseDisplay(type: string, value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (type === 'DateTime') return ds(value as Date)
  return value
}

type EditActor = { id: string; email: string }
type EditMeta = { ip?: string | null; userAgent?: string | null }

/** 案件のフィールド更新を永続化し、変更履歴・監査に記録（フラット列 { column: value }） */
export async function updateCaseField(
  actor: EditActor,
  id: number,
  raw: string,
  meta: EditMeta
) {
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  const existing = await prisma.case.findUnique({ where: { id } })
  if (!existing) return { status: 404, body: { error: '案件が見つかりません' } }

  // ── 楽観ロック（先勝ち）──
  // クライアントは読み込み時点の updatedAt（ISO・ミリ秒）を __baseUpdatedAt、
  // タブ単位の識別子を __clientId で送る。
  // 自分のタブ以外が先に保存していた場合は 409 を返して保存しない。
  //
  // 以前は「最終更新者のメールが自分と違うか」で判定していたため、
  // 同じアカウントの別ウィンドウ同士は競合とみなされず、警告なしで上書きされていた。
  // セッション単位で比較することで、アカウント共有時の上書き事故も検知できる。
  const baseUpdatedAt =
    typeof body.__baseUpdatedAt === 'string' ? body.__baseUpdatedAt : null
  const clientId = typeof body.__clientId === 'string' ? body.__clientId : null
  delete body.__baseUpdatedAt
  delete body.__clientId
  if (baseUpdatedAt) {
    const current = existing.updatedAt.toISOString()
    const lastClient = (existing as { updatedByClient?: string | null }).updatedByClient ?? null
    // 直前の保存が自分のタブ自身なら競合ではない（連続保存で自分を弾かないため）
    const bySomeoneElse = lastClient ? lastClient !== clientId : !!existing.updatedBy
    if (current > baseUpdatedAt && bySomeoneElse) {
      return {
        status: 409,
        body: {
          conflict: true,
          editedBy: existing.updatedBy,
          case: toCaseJson(existing),
        },
      }
    }
  }

  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const updateData: Record<string, unknown> = {}
  for (const [col, val] of Object.entries(body)) {
    const type = CASE_FIELD_TYPE[col]
    if (!type) continue // ホワイトリスト外は無視
    const dbVal = caseToDb(type, val)
    const beforeDisp = caseDisplay(type, (existing as Record<string, unknown>)[col])
    const afterDisp = caseDisplay(type, dbVal)
    if (JSON.stringify(beforeDisp) !== JSON.stringify(afterDisp)) {
      before[col] = beforeDisp
      after[col] = afterDisp
      updateData[col] = dbVal
    }
  }
  if (Object.keys(updateData).length === 0) {
    return { status: 200, body: { case: toCaseJson(existing), changed: false } }
  }
  updateData.updatedBy = actor.email
  updateData.updatedByClient = clientId
  const updated = await prisma.case.update({ where: { id }, data: updateData })
  await writeChange({
    actor,
    entity: 'Case',
    entityId: String(id),
    action: 'UPDATE',
    before,
    after,
  })
  await writeAudit({
    actor,
    action: 'UPDATE',
    entity: 'Case',
    entityId: String(id),
    summary: `案件編集（${Object.keys(after).join(', ')}）`,
    metadata: { before, after },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
  return { status: 200, body: { case: toCaseJson(updated), changed: true } }
}

// ── 子テーブル（Creditor / Payment / ContactHistory）の汎用CRUD ──
type RowModel = 'Creditor' | 'Payment' | 'ContactHistory'
type RowDelegate = {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>
  create: (a: unknown) => Promise<Record<string, unknown>>
  update: (a: unknown) => Promise<Record<string, unknown>>
  delete: (a: unknown) => Promise<Record<string, unknown>>
}
function rowDelegate(model: RowModel): RowDelegate {
  return (
    model === 'Creditor'
      ? prisma.creditor
      : model === 'Payment'
        ? prisma.payment
        : prisma.contactHistory
  ) as unknown as RowDelegate
}
const rowLabel = (m: RowModel) => (m === 'Creditor' ? '債権者' : m === 'Payment' ? '入金' : '接触履歴')
function rowToJson(m: RowModel, r: Record<string, unknown>): unknown {
  return m === 'Creditor' ? toCreditorJson(r) : m === 'Payment' ? toPaymentJson(r) : toContactJson(r)
}

/** 子テーブル行のフィールド更新を永続化し、変更履歴・監査に記録 */
async function updateRowField(
  model: RowModel,
  fieldType: Record<string, string>,
  actor: EditActor,
  id: number,
  raw: string,
  meta: EditMeta
) {
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  const delegate = rowDelegate(model)
  const existing = await delegate.findUnique({ where: { id } })
  if (!existing) return { status: 404, body: { error: '対象が見つかりません' } }

  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const updateData: Record<string, unknown> = {}
  for (const [col, val] of Object.entries(body)) {
    const type = fieldType[col]
    if (!type) continue
    const dbVal = caseToDb(type, val)
    const beforeDisp = caseDisplay(type, existing[col])
    const afterDisp = caseDisplay(type, dbVal)
    if (JSON.stringify(beforeDisp) !== JSON.stringify(afterDisp)) {
      before[col] = beforeDisp
      after[col] = afterDisp
      updateData[col] = dbVal
    }
  }
  if (Object.keys(updateData).length === 0) return { status: 200, body: { changed: false } }
  const updated = await delegate.update({ where: { id }, data: updateData })
  await writeChange({ actor, entity: model, entityId: String(id), action: 'UPDATE', before, after })
  await writeAudit({
    actor,
    action: 'UPDATE',
    entity: model,
    entityId: String(id),
    summary: `${rowLabel(model)}編集（${Object.keys(after).join(', ')}）`,
    metadata: { before, after, caseId: existing.caseId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
  return { status: 200, body: { changed: true, row: rowToJson(model, updated) } }
}

/** 子テーブル行の追加（変更履歴 CREATE ＋監査） */
async function createRow(
  model: RowModel,
  fieldType: Record<string, string>,
  actor: EditActor,
  raw: string,
  meta: EditMeta
) {
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  const caseId = Number(body.caseId)
  if (!Number.isFinite(caseId)) return { status: 400, body: { error: 'caseId が必要です' } }
  const data: Record<string, unknown> = { caseId }
  for (const [col, val] of Object.entries(body)) {
    const type = fieldType[col]
    if (!type) continue
    data[col] = caseToDb(type, val)
  }
  // enum / FK の特別扱い
  if (model === 'ContactHistory') {
    data.targetType =
      body.targetType === '債権者' || body.targetType === 'CREDITOR' ? 'CREDITOR' : 'CLIENT'
  }
  if (model === 'Payment') {
    if (body.creditorId != null && body.creditorId !== '') data.creditorId = Number(body.creditorId)
    if (body.creditorInstallmentIndex != null && body.creditorInstallmentIndex !== '')
      data.creditorInstallmentIndex = Number(body.creditorInstallmentIndex)
  }
  const created = await rowDelegate(model).create({ data })
  const after: Record<string, unknown> = {}
  for (const col of Object.keys(fieldType)) {
    const v = caseDisplay(fieldType[col], created[col])
    if (v != null && v !== '') after[col] = v
  }
  await writeChange({ actor, entity: model, entityId: String(created.id), action: 'CREATE', before: null, after })
  await writeAudit({
    actor,
    action: 'CREATE',
    entity: model,
    entityId: String(created.id),
    summary: `${rowLabel(model)}追加`,
    metadata: { after, caseId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
  return { status: 200, body: { row: rowToJson(model, created) } }
}

/** 子テーブル行の削除（変更履歴 DELETE ＋監査） */
async function deleteRow(
  model: RowModel,
  fieldType: Record<string, string>,
  actor: EditActor,
  id: number,
  meta: EditMeta
) {
  const existing = await rowDelegate(model).findUnique({ where: { id } })
  if (!existing) return { status: 404, body: { error: '対象が見つかりません' } }
  const before: Record<string, unknown> = {}
  for (const col of Object.keys(fieldType)) {
    const v = caseDisplay(fieldType[col], existing[col])
    if (v != null && v !== '') before[col] = v
  }
  await rowDelegate(model).delete({ where: { id } })
  await writeChange({ actor, entity: model, entityId: String(id), action: 'DELETE', before, after: null })
  await writeAudit({
    actor,
    action: 'DELETE',
    entity: model,
    entityId: String(id),
    summary: `${rowLabel(model)}削除`,
    metadata: { before, caseId: existing.caseId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
  return { status: 200, body: { ok: true } }
}

export const updateCreditorField = (actor: EditActor, id: number, raw: string, meta: EditMeta) =>
  updateRowField('Creditor', CREDITOR_FIELD_TYPE, actor, id, raw, meta)
export const updatePaymentField = (actor: EditActor, id: number, raw: string, meta: EditMeta) =>
  updateRowField('Payment', PAYMENT_FIELD_TYPE, actor, id, raw, meta)
export const createPayment = (actor: EditActor, raw: string, meta: EditMeta) =>
  createRow('Payment', PAYMENT_FIELD_TYPE, actor, raw, meta)
export const updateContactHistoryField = (actor: EditActor, id: number, raw: string, meta: EditMeta) =>
  updateRowField('ContactHistory', CONTACT_FIELD_TYPE, actor, id, raw, meta)
export const createContactHistory = (actor: EditActor, raw: string, meta: EditMeta) =>
  createRow('ContactHistory', CONTACT_FIELD_TYPE, actor, raw, meta)
export const deleteContactHistory = (actor: EditActor, id: number, meta: EditMeta) =>
  deleteRow('ContactHistory', CONTACT_FIELD_TYPE, actor, id, meta)
/**
 * 入金予定・弁済予定の行の削除。
 * 辞任などで予定が大幅に不要になる場合に使う。
 * 変更履歴に before を残すので、誤って消しても内容は追える。
 */
export const deletePayment = (actor: EditActor, id: number, meta: EditMeta) =>
  deleteRow('Payment', PAYMENT_FIELD_TYPE, actor, id, meta)

/**
 * 案件（Case）の削除。ADMIN ロール限定。
 * 子テーブル（債権者・入金・接触履歴・LINE連携・通知ログ）は
 * schema の onDelete: Cascade により連動して削除される。
 * 監査ログに削除内容（外部ID・氏名）を残す。
 */
export async function deleteCase(
  actor: EditActor & { role?: string | null },
  id: number,
  meta: EditMeta
) {
  if (actor.role !== 'ADMIN')
    return { status: 403, body: { error: '案件の削除には管理者権限が必要です' } }
  const existing = await prisma.case.findUnique({
    where: { id },
    select: { id: true, name: true, externalId: true },
  })
  if (!existing) return { status: 404, body: { error: '対象の案件が見つかりません' } }

  await prisma.case.delete({ where: { id } })
  await writeAudit({
    actor,
    action: 'DELETE',
    entity: 'Case',
    entityId: String(id),
    summary: `案件削除: ${existing.name ?? '(無名)'}（ID:${existing.externalId ?? id}）`,
    metadata: { externalId: existing.externalId, name: existing.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
  return { status: 200, body: { ok: true } }
}

/** 案件の変更履歴（本体＋その案件の債権者・入金の変更も含む。新しい順） */
export async function getCaseChanges(id: number) {
  const [creditors, payments, contacts] = await Promise.all([
    prisma.creditor.findMany({ where: { caseId: id }, select: { id: true } }),
    prisma.payment.findMany({ where: { caseId: id }, select: { id: true } }),
    prisma.contactHistory.findMany({ where: { caseId: id }, select: { id: true } }),
  ])
  const credIds = creditors.map((c) => String(c.id))
  const payIds = payments.map((p) => String(p.id))
  const contactIds = contacts.map((c) => String(c.id))
  const or: Prisma.ChangeLogWhereInput[] = [{ entity: 'Case', entityId: String(id) }]
  if (credIds.length) or.push({ entity: 'Creditor', entityId: { in: credIds } })
  if (payIds.length) or.push({ entity: 'Payment', entityId: { in: payIds } })
  if (contactIds.length) or.push({ entity: 'ContactHistory', entityId: { in: contactIds } })
  const rows = await prisma.changeLog.findMany({
    where: { OR: or },
    orderBy: { id: 'desc' },
    take: 200,
    include: { actor: { select: { name: true, email: true } } },
  })
  return rows.map((r) => ({
    id: r.id.toString(),
    entity: r.entity,
    action: r.action,
    actor: r.actor?.name ?? r.actorEmail ?? '—',
    before: r.before,
    after: r.after,
    reverted: r.reverted,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** 変更を元に戻す（現状は Case の UPDATE を対象） */
export async function revertChange(
  actor: EditActor,
  changeLogId: string,
  meta: EditMeta
) {
  let clId: bigint
  try {
    clId = BigInt(changeLogId)
  } catch {
    return { status: 400, body: { error: 'invalid id' } }
  }
  const cl = await prisma.changeLog.findUnique({ where: { id: clId } })
  if (!cl) return { status: 404, body: { error: '変更が見つかりません' } }
  if (cl.reverted) return { status: 400, body: { error: '既に元に戻されています' } }
  if (cl.action !== 'UPDATE') {
    return { status: 400, body: { error: '追加・削除の変更は元に戻せません' } }
  }
  const fieldType =
    cl.entity === 'Case'
      ? CASE_FIELD_TYPE
      : cl.entity === 'Creditor'
        ? CREDITOR_FIELD_TYPE
        : cl.entity === 'Payment'
          ? PAYMENT_FIELD_TYPE
          : cl.entity === 'ContactHistory'
            ? CONTACT_FIELD_TYPE
            : null
  if (!fieldType) {
    return { status: 400, body: { error: 'この種別は元に戻せません' } }
  }
  const before = (cl.before ?? {}) as Record<string, unknown>
  const after = (cl.after ?? {}) as Record<string, unknown>
  const rowId = Number(cl.entityId)
  const updateData: Record<string, unknown> = {}
  const revBefore: Record<string, unknown> = {}
  const revAfter: Record<string, unknown> = {}
  for (const col of Object.keys(after)) {
    const type = fieldType[col]
    if (!type) continue
    updateData[col] = caseToDb(type, before[col])
    revBefore[col] = after[col]
    revAfter[col] = before[col]
  }
  if (Object.keys(updateData).length === 0) {
    return { status: 400, body: { error: '戻せる項目がありません' } }
  }
  if (cl.entity === 'Case') updateData.updatedBy = actor.email
  const delegate = (
    cl.entity === 'Case'
      ? prisma.case
      : cl.entity === 'Creditor'
        ? prisma.creditor
        : cl.entity === 'Payment'
          ? prisma.payment
          : prisma.contactHistory
  ) as { update: (a: unknown) => Promise<unknown> }
  await delegate.update({ where: { id: rowId }, data: updateData })
  await prisma.changeLog.update({
    where: { id: clId },
    data: { reverted: true, revertedAt: new Date(), revertedById: actor.id },
  })
  await writeChange({
    actor,
    entity: cl.entity,
    entityId: cl.entityId,
    action: 'UPDATE',
    before: revBefore,
    after: revAfter,
  })
  await writeAudit({
    actor,
    action: 'UPDATE',
    entity: cl.entity,
    entityId: cl.entityId,
    summary: `変更を元に戻す（${Object.keys(revAfter).join(', ')}）`,
    metadata: { revertedChangeId: changeLogId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
  return { status: 200, body: { ok: true } }
}
/** 重複を除いた債権者名の一覧（検索ドロップダウン用・軽量） */
export async function getCreditorNames() {
  const [rows, partners] = await Promise.all([
    prisma.creditor.findMany({
      distinct: ['creditorName'],
      select: { creditorName: true },
      orderBy: { creditorName: 'asc' },
    }),
    // 交渉相手（債権回収会社など）の入力候補。表記ゆれを防ぐため既存値から出す
    prisma.creditor.findMany({
      where: { negotiationPartner: { not: null } },
      distinct: ['negotiationPartner'],
      select: { negotiationPartner: true },
      orderBy: { negotiationPartner: 'asc' },
    }),
  ])
  return {
    names: rows.map((r) => r.creditorName).filter((n): n is string => !!n),
    partners: partners
      .map((r) => r.negotiationPartner)
      .filter((n): n is string => !!n && n.trim() !== ''),
  }
}

/**
 * 債権者リマインド一覧用：次回処理日ありの債権者のみ、必要列だけを軽量に返す。
 * 全債権者(1.6万件)を転送しないことでパフォーマンスを確保する。
 */
export async function getCreditorReminders() {
  const rows = await prisma.creditor.findMany({
    where: { nextProcessDate: { not: null } },
    select: {
      id: true,
      caseId: true,
      creditorName: true,
      status: true,
      settlementDate: true,
      settlementAmount: true,
      nextProcessDate: true,
    },
    orderBy: [{ nextProcessDate: 'asc' }, { id: 'asc' }],
  })
  return rows.map((c) => ({
    id: c.id,
    caseId: c.caseId,
    creditorName: c.creditorName,
    status: c.status,
    settlementDate: ds(c.settlementDate),
    settlementAmount: c.settlementAmount,
    nextProcessDate: ds(c.nextProcessDate),
  }))
}

/**
 * 和解実績一覧用：表示・絞り込みに必要な列だけを返す軽量版。
 * 全債権者を「全フィールド」で転送していた重さ(15〜19MB)を数分の一に抑える。
 */
export async function getSettlementCreditors() {
  const rows = await prisma.creditor.findMany({
    select: {
      id: true,
      caseId: true,
      creditorName: true,
      status: true,
      responseStatus: true,
      settlementDate: true,
      settlementAmount: true,
      settlementDebtAmount: true,
      settlementContentComment: true,
      acceptanceNoticeSentDate: true,
      debtAmount: true,
    },
    orderBy: { id: 'asc' },
  })
  return rows.map((c) => ({
    id: c.id,
    caseId: c.caseId,
    creditorName: c.creditorName,
    status: c.status,
    responseStatus: c.responseStatus,
    settlementDate: ds(c.settlementDate),
    settlementAmount: c.settlementAmount,
    settlementDebtAmount: c.settlementDebtAmount,
    settlementContentComment: c.settlementContentComment,
    acceptanceNoticeSentDate: ds(c.acceptanceNoticeSentDate),
    debtAmount: c.debtAmount,
  }))
}

/** caseId 指定時はその案件のみ（案件詳細の遅延読み込み用） */
export async function getCreditors(caseId?: number) {
  const rows = await prisma.creditor.findMany({
    where: caseId ? { caseId } : undefined,
    // 表示順: displayOrder 昇順（未設定は末尾）→ id 昇順。
    // 受任→受任対象外の並びとUIのドラッグ並べ替え結果を反映する。
    orderBy: [
      { displayOrder: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ] as never,
  })
  return rows.map(toCreditorJson)
}
export async function getPayments(caseId?: number) {
  const rows = await prisma.payment.findMany({
    where: caseId ? { caseId } : undefined,
    orderBy: { id: 'asc' },
  })
  return rows.map(toPaymentJson)
}
export async function getContactHistories(caseId?: number) {
  const rows = await prisma.contactHistory.findMany({
    where: caseId ? { caseId } : undefined,
    orderBy: { id: 'asc' },
  })
  return rows.map(toContactJson)
}

/** 入金差異（予定額≠実入金額）のみをサーバ抽出。全件転送を避ける */
export async function getPaymentDiscrepancies() {
  const rows = await prisma.$queryRawUnsafe<
    {
      id: number
      caseId: number
      externalId: string | null
      caseName: string | null
      plannedDate: Date | null
      plannedAmount: number | null
      actualDate: Date | null
      actualAmount: number | null
    }[]
  >(
    `SELECT p.id, p."caseId", c."externalId", c.name AS "caseName",
            p."plannedDate", p."plannedAmount", p."actualDate", p."actualAmount"
     FROM payments p JOIN cases c ON c.id = p."caseId"
     WHERE p."actualDate" IS NOT NULL AND p."plannedDate" IS NOT NULL
       AND p."plannedAmount" IS DISTINCT FROM p."actualAmount"`
  )
  return rows.map((r) => ({
    id: r.id,
    caseId: r.caseId,
    externalId: r.externalId,
    caseName: r.caseName,
    plannedDate: ds(r.plannedDate),
    plannedAmount: r.plannedAmount ?? 0,
    actualDate: ds(r.actualDate),
    actualAmount: r.actualAmount ?? 0,
  }))
}

/** 「次回入金日」が未入金の案件ID（入金管理一覧の未入金フィルタ用） */
export async function getUnpaidCaseIds() {
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT c.id FROM cases c
     WHERE c."nextPaymentDate" IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM payments p
         WHERE p."caseId" = c.id AND p."creditorId" IS NULL
           AND p."plannedDate" = c."nextPaymentDate" AND p."actualDate" IS NOT NULL
       )`
  )
  return { caseIds: rows.map((r) => r.id) }
}

/** 入金遅延モニタリング: 遅延/リスク案件をサーバ側で算出して返す（全 payments 転送を回避） */
export async function getPaymentDelays() {
  const [cases, payments] = await Promise.all([
    prisma.case.findMany({ select: { id: true, externalId: true, name: true } }),
    prisma.payment.findMany({
      select: { id: true, caseId: true, plannedDate: true, actualDate: true },
    }),
  ])
  type SvcPayments = Parameters<typeof calculateDelayStats>[1]
  const byCase = new Map<number, SvcPayments>()
  for (const p of payments) {
    const row = {
      id: p.id,
      caseId: p.caseId,
      plannedDate: ds(p.plannedDate),
      actualDate: ds(p.actualDate),
    }
    const arr = (byCase.get(p.caseId) ?? []) as unknown[]
    arr.push(row)
    byCase.set(p.caseId, arr as unknown as SvcPayments)
  }

  const result = cases
    .map((c) => {
      const casePayments = (byCase.get(c.id) ?? []) as SvcPayments
      const stats = calculateDelayStats(c.id, casePayments)
      const overduePayments = detectPaymentDelays(casePayments)
      return {
        case: {
          id: c.id,
          metadata: { externalId: c.externalId },
          clientBasicInfo: { name: c.name },
        },
        stats,
        overduePayments,
      }
    })
    .filter(
      (r) =>
        r.overduePayments.length > 0 ||
        r.stats.delayedPayments > 0 ||
        r.stats.riskLevel !== 'low'
    )

  const riskOrder = { high: 3, medium: 2, low: 1 } as const
  result.sort((a, b) => {
    const d = riskOrder[b.stats.riskLevel] - riskOrder[a.stats.riskLevel]
    return d !== 0 ? d : b.stats.consecutiveDelays - a.stats.consecutiveDelays
  })
  return result
}

export const apiRoutes: Record<string, (caseId?: number) => Promise<unknown>> = {
  '/api/cases': getCasesSummary,
  '/api/creditors': getCreditors,
  '/api/creditors/names': getCreditorNames,
  '/api/payments': getPayments,
  '/api/payments/discrepancies': getPaymentDiscrepancies,
  '/api/payments/unpaid-case-ids': getUnpaidCaseIds,
  '/api/payments/delays': getPaymentDelays,
  '/api/contact-histories': getContactHistories,
}

// ── LINE 連携（登録コード発行・連携状況） ──
function generateRegistrationCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 0/O/1/I 等を除外
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export async function getLineLink(caseId: number) {
  const link = await prisma.lineLink.findUnique({ where: { caseId } })
  return link ?? { caseId, status: 'NONE' }
}

export async function issueLineCode(caseId: number, force = false) {
  const exists = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true },
  })
  if (!exists) return { error: 'case not found' }

  // 冪等化: 既にコードがあり force でなければ、既存コードをそのまま返す。
  // （「発行」や画面表示のたびにコードが変わり、依頼者に渡した旧コードが
  //  無効化される事故を防ぐ。LINKED の場合も連携を解除しない）
  const current = await prisma.lineLink.findUnique({ where: { caseId } })
  if (current && !force) return current

  let code = generateRegistrationCode()
  for (let i = 0; i < 5; i++) {
    const dup = await prisma.lineLink.findUnique({
      where: { registrationCode: code },
    })
    if (!dup) break
    code = generateRegistrationCode()
  }
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 90)

  return prisma.lineLink.upsert({
    where: { caseId },
    create: {
      caseId,
      registrationCode: code,
      status: 'PENDING',
      codeExpiresAt: expiresAt,
    },
    update: {
      registrationCode: code,
      status: 'PENDING',
      codeExpiresAt: expiresAt,
      lineUserId: null,
      linkedAt: null,
    },
  })
}

// ── 編集中プレゼンス（同時編集の検知・編集中ポップアップ用） ──────────
// 案件詳細を開いているクライアントが一定間隔でハートビートを送り、
// 同じレコードを開いている他ユーザー（TTL内）を返す。離脱時は明示削除。
// Prisma Client の型生成に依存しないよう、パラメータ化した生SQLで操作する
// （テーブルは migration 20260706000000_add_edit_presence で作成）。
const PRESENCE_TTL_SECONDS = 45
// 編集中フラグの有効期間。編集中クライアントは短い間隔でハートビートを送るため、
// これを超えて更新が無い editing=true は「切断などで放置されたロック」とみなして無効化する。
const EDITING_TTL_SECONDS = 25

/** プレゼンス1行（ロック判定に使う形） */
export type PresenceRow = {
  clientId: string
  email: string
  name: string
  editing: boolean
  editingSince: string | null
  startedAt: string
}

/**
 * ロック保持者を1人に決める（先に編集を始めた人が優先）。
 *
 * 以前はクライアント側で「編集中の誰か」を見つけるだけだったため、
 * A と B がほぼ同時に編集を始めると互いを編集中と判定し、
 * 両方にポップアップが出たまま解除されない相互ブロックが起きていた。
 * サーバ側で editingSince の早い順に1人だけ選ぶことで構造的に防ぐ。
 */
export function pickLockHolder(rows: PresenceRow[]): PresenceRow | null {
  const editing = rows.filter((r) => r.editing)
  if (editing.length === 0) return null
  return editing.slice().sort((a, b) => {
    const sa = a.editingSince ?? a.startedAt
    const sb = b.editingSince ?? b.startedAt
    if (sa !== sb) return sa < sb ? -1 : 1
    // 同時刻なら clientId で決定的に決める（両者が同じ勝者を選ぶことが重要）
    return a.clientId < b.clientId ? -1 : 1
  })[0]
}

export async function presenceHeartbeat(actor: EditActor & { name?: string | null }, raw: string) {
  let body: {
    entity?: string
    entityId?: number
    clientId?: string
    name?: string
    editing?: boolean
  }
  try {
    body = JSON.parse(raw || '{}') as typeof body
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  const entity = body.entity === 'Case' ? 'Case' : null
  const entityId = Number(body.entityId)
  // clientId はタブ単位の識別子。未送信の古いクライアントはメールで代替する
  const clientId = (body.clientId ?? '').toString().slice(0, 100) || actor.email
  if (!entity || !Number.isInteger(entityId) || entityId <= 0) {
    return { status: 400, body: { error: 'bad request' } }
  }
  const name = (body.name ?? actor.name ?? '').toString().slice(0, 100)
  const editing = body.editing === true

  // 滞在＋編集状態の記録（upsert）。
  // editingSince は「編集中が継続している間は最初の開始時刻を保つ」ことが肝で、
  // ハートビートのたびに更新すると先着判定が壊れる。
  await prisma.$executeRawUnsafe(
    `INSERT INTO edit_presences
       ("entity", "entityId", "clientId", "email", "name", "editing", "editingSince", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT ("entity", "entityId", "clientId")
     DO UPDATE SET
       "email" = EXCLUDED."email",
       "name" = EXCLUDED."name",
       "editing" = EXCLUDED."editing",
       "editingSince" = CASE
         WHEN EXCLUDED."editing" AND edit_presences."editing"
              AND edit_presences."editingSince" IS NOT NULL
           THEN edit_presences."editingSince"
         WHEN EXCLUDED."editing" THEN NOW()
         ELSE NULL
       END,
       "updatedAt" = NOW()`,
    entity,
    entityId,
    clientId,
    actor.email,
    name,
    editing
  )
  // ついで掃除（TTL大幅超過の残骸を削除）
  await prisma.$executeRawUnsafe(
    `DELETE FROM edit_presences WHERE "updatedAt" < NOW() - INTERVAL '10 minutes'`
  )

  // 同じレコードを開いている全セッション（自分を含む・TTL内）。
  // 自分も含めて取得し、サーバ側でロック保持者を決める。
  // editing は鮮度切れ（切断で放置されたロック）なら false に落とす。
  const rows = await prisma.$queryRawUnsafe<
    {
      clientId: string
      email: string
      name: string
      editing: boolean
      editingSince: Date | null
      startedAt: Date
    }[]
  >(
    `SELECT "clientId", "email", "name", "editingSince", "startedAt",
            ("editing" AND "updatedAt" > NOW() - INTERVAL '${EDITING_TTL_SECONDS} seconds') AS "editing"
     FROM edit_presences
     WHERE "entity" = $1 AND "entityId" = $2
       AND "updatedAt" > NOW() - INTERVAL '${PRESENCE_TTL_SECONDS} seconds'`,
    entity,
    entityId
  )

  const iso = (d: Date | null): string | null =>
    d instanceof Date ? d.toISOString() : d == null ? null : String(d)
  const all: PresenceRow[] = rows.map((r) => ({
    clientId: r.clientId,
    email: r.email,
    name: r.name || r.email,
    editing: r.editing === true,
    editingSince: iso(r.editingSince),
    startedAt: iso(r.startedAt) ?? '',
  }))

  const holder = pickLockHolder(all)
  const others = all.filter((r) => r.clientId !== clientId)

  return {
    status: 200,
    body: {
      // 自分以外で同じレコードを開いているセッション（同一アカウントの別ウィンドウも含む）
      others: others.map((o) => ({
        email: o.email,
        name: o.name,
        editing: o.editing,
        startedAt: o.startedAt,
        // 同じアカウントを別ウィンドウで開いている場合は表示を変えるための印
        sameAccount: o.email === actor.email,
      })),
      // ロック保持者。自分が保持者なら編集を続けてよい
      lock: holder
        ? {
            name: holder.name,
            editing: true,
            isMine: holder.clientId === clientId,
            sameAccount: holder.email === actor.email,
          }
        : null,
    },
  }
}

export async function presenceLeave(actor: EditActor, raw: string) {
  let body: { entity?: string; entityId?: number; clientId?: string }
  try {
    body = JSON.parse(raw || '{}') as { entity?: string; entityId?: number; clientId?: string }
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  const entity = body.entity === 'Case' ? 'Case' : null
  const entityId = Number(body.entityId)
  if (!entity || !Number.isInteger(entityId) || entityId <= 0) {
    return { status: 400, body: { error: 'bad request' } }
  }
  const clientId = (body.clientId ?? '').toString().slice(0, 100)
  // clientId があればそのタブだけ、無ければ従来どおりアカウント単位で削除する
  if (clientId) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM edit_presences WHERE "entity" = $1 AND "entityId" = $2 AND "clientId" = $3`,
      entity,
      entityId,
      clientId
    )
  } else {
    await prisma.$executeRawUnsafe(
      `DELETE FROM edit_presences WHERE "entity" = $1 AND "entityId" = $2 AND "email" = $3`,
      entity,
      entityId,
      actor.email
    )
  }
  return { status: 200, body: { ok: true } }
}
