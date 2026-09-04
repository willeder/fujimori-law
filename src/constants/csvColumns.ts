/**
 * CSVの列定義と見出しの付け方。**出力と取込で同じものを使う。**
 *
 * 出力（caseCsvExport）と取込（caseCsvImport）で見出しの作り方がずれると、
 * 「出したCSVをそのまま取り込めない」という一番困る壊れ方をする。
 * 以前は api/data.ts と vite.config.ts に同じ labelOf が写経されていたため、
 * 片方だけ直すと本番と開発で挙動が変わる状態だった。ここに集約する。
 *
 * 見出しの決まり（事務所と確認 2026-09-03）:
 *   ・突合用の内部IDは【案件ID】【債権者ID】のように【】で囲む。
 *     触ってはいけない列であること、取込の突合キーであることを見出しで示す。
 *   ・差額や累計など、他の値から計算して出している項目は［計算］を付ける。
 *     取込では読み飛ばすため、直しても反映されないことを見出しで示す。
 *   ・テーブルの項目は「債権者：和解金額」のように、テーブル名を前に付ける。
 *     案件側と同じ名前の項目（ステータス等）があるため。
 */
import { FIELD_LABEL } from './fieldLabels'

export type CsvTableKey = 'creditor' | 'payment' | 'contact'

export const CSV_TABLE_NAME: Record<CsvTableKey, string> = {
  creditor: '債権者',
  payment: '入金',
  contact: '接触履歴',
}

export const CSV_TABLE_ORDER: CsvTableKey[] = ['creditor', 'payment', 'contact']

/**
 * 他の値から計算して出している項目（DBに書き戻してはいけない）。
 *   difference     … 申告額 − 債務額
 *   cumulativePool … 累計プール
 *   elapsedDays    … 受任からの経過日数
 *   age            … 生年月日からの年齢
 */
export const CSV_CALCULATED = new Set(['difference', 'cumulativePool', 'elapsedDays', 'age'])

/** テーブルごとに出せる項目（DBの列名）。並びは schema.prisma の定義順に合わせてある */
export const CREDITOR_FIELDS = [
  'id', 'caseId', 'creditorName', 'negotiationPartner', 'declaredAmount', 'debtAmount',
  'expectedSettlement', 'expectedSettlementAmount', 'expectedPaymentCount', 'expectedFutureInterest',
  'status', 'check', 'nextProcessDate', 'acceptanceNoticeSentDate', 'debtInquiryArrivalDate',
  'customerCode', 'contractDate', 'settlementProposalDate', 'settlementProposal', 'responseStatus',
  'settlementDate', 'settlementAmount', 'settlementDebtAmount', 'settlementContentComment',
  'reminder', 'paymentStartMonth', 'paymentDay', 'paymentCount', 'firstPaymentAmount',
  'subsequentPaymentAmount', 'finalPaymentAmount', 'finalPaymentMonth', 'futureInterest',
  'bankName', 'financialInstitutionCode', 'branchName', 'branchCode', 'accountType',
  'accountNumber', 'accountHolder', 'designatedCode', 'repaymentTarget', 'fundIncreaseAction',
  'displayOrder',
]

export const PAYMENT_FIELDS = [
  'id', 'caseId', 'creditorId', 'creditorInstallmentIndex', 'plannedDate', 'plannedAmount',
  'plannedFeeAllocation', 'plannedAgentFeeAllocation', 'plannedPoolAllocation',
  'plannedRepaymentAllocation', 'actualDate', 'actualAmount', 'actualFeeAllocation',
  'actualAgentFeeAllocation', 'actualPoolAllocation', 'actualRepaymentAllocation',
  'handlingFee', 'repaymentCount', 'repaymentDate', 'actualRepaymentCount', 'actualHandlingFee',
  'cumulativePool', 'check',
]

export const CONTACT_FIELDS = [
  'id', 'caseId', 'contactDate', 'contactTime', 'staff', 'tool', 'targetType', 'creditorName', 'comment',
]

export const CSV_TABLE_FIELDS: Record<CsvTableKey, string[]> = {
  creditor: CREDITOR_FIELDS,
  payment: PAYMENT_FIELDS,
  contact: CONTACT_FIELDS,
}

/**
 * CSVの見出し文字列を作る。
 * @param kind  'case' か テーブルのキー
 * @param field 案件は道順（"clientBasicInfo.name"）、テーブルはDBの列名
 */
export function csvHeaderLabel(kind: string, field: string): string {
  const leaf = field.split('.').pop() ?? field
  const name = FIELD_LABEL[leaf] ?? leaf
  const tableName = CSV_TABLE_NAME[kind as CsvTableKey]
  if (leaf === 'id') return `【${kind === 'case' ? '案件ID' : `${tableName}ID`}】`
  const base = kind === 'case' ? name : `${tableName}：${name}`
  return CSV_CALCULATED.has(leaf) ? `${base}［計算］` : base
}
