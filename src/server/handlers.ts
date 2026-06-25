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
  return { ...p, plannedDate: ds(p.plannedDate), actualDate: ds(p.actualDate) }
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
    },
    appointmentInfo: {
      acceptanceDate: ds(c.acceptanceDate),
      acceptanceRank: c.acceptanceRank,
      debtAdjustmentType: c.debtAdjustmentType,
      appointmentStaff: c.appointmentStaff,
      interviewStaff: c.interviewStaff,
      judicialScrivener: c.judicialScrivener,
    },
    debtInfo: {
      creditorCount: c.creditorCount,
      declaredDebtAmount: c.declaredDebtAmount,
    },
    settlementInfo: { status: c.settlementStatus },
    feeInfo: { officeFee: c.officeFee, uncollectedFee: c.uncollectedFee },
    paymentInfo: { nextPaymentDate: ds(c.nextPaymentDate) },
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
  nextPaymentDate: true,
  listCategory: true,
  listRegisteredDate: true,
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
 * 複数条件（AND）の横断検索。条件: { field, value }[]。
 * すべての列をテキスト化して **部分一致（ILIKE・大小無視）** で検索する。
 *   - 文字列/数値/日付  → CAST(列 AS TEXT) に対する含む検索（例: 申告債務額"200"・受任日"2026-05"）
 *   - 電話番号          → 数字のみ正規化して含む検索（ハイフン無視・下4桁可）
 *   - creditorName      → 債権者リレーションの含む検索
 * 列名はホワイトリスト（DMMF由来）済みのみ使用し、値はパラメータ化（インジェクション対策）。
 */
export async function searchCases(raw: string) {
  let conditions: { field: string; value: string }[] = []
  try {
    const body = JSON.parse(raw || '{}') as { conditions?: { field: string; value: string }[] }
    conditions = body.conditions ?? []
  } catch {
    return { error: 'bad request' }
  }
  const wheres: string[] = []
  const params: string[] = []
  for (const cond of conditions) {
    const v = (cond?.value ?? '').trim()
    if (!v) continue
    if (cond.field === 'creditorName') {
      params.push(`%${v}%`)
      wheres.push(
        `EXISTS (SELECT 1 FROM creditors cr WHERE cr."caseId" = c.id AND cr."creditorName" ILIKE $${params.length})`
      )
      continue
    }
    if (cond.field === 'phone') {
      params.push(`%${v.replace(/\D/g, '')}%`)
      wheres.push(`regexp_replace(COALESCE(c."phone", ''), '[^0-9]', '', 'g') ILIKE $${params.length}`)
      continue
    }
    if (!CASE_SEARCH_TYPE[cond.field]) continue // ホワイトリスト外は無視（列名はここで検証）
    params.push(`%${v}%`)
    wheres.push(`CAST(c."${cond.field}" AS TEXT) ILIKE $${params.length}`)
  }

  const sql = `SELECT c.id FROM cases c${
    wheres.length ? ' WHERE ' + wheres.join(' AND ') : ''
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
  const rows = await prisma.creditor.findMany({
    distinct: ['creditorName'],
    select: { creditorName: true },
    orderBy: { creditorName: 'asc' },
  })
  return { names: rows.map((r) => r.creditorName).filter((n): n is string => !!n) }
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
