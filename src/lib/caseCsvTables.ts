/**
 * CSV出力でテーブル（債権者・入金・接触履歴）も出すための定義と、出力の実行。
 *
 * 事務所のご指定（2026-09-03）:
 *   「テーブルがある場合は、そのテーブルを指定すると、テーブル内の全フィールドを
 *     出力するなど（kintoneと同様）」
 *   ・1行＝テーブルの1行。先頭に案件の項目を付ける
 *   ・複数テーブルのときは、1つ目が終わったあと次のテーブルが始まる。
 *     その行では他のテーブルの列は空欄
 *   ・対象は全件
 *
 * テーブルのデータは案件一覧に読み込んでいない（入金だけで19.6万行ある）ので、
 * サーバでCSVを組み立てて、そのまま受け取って保存する。
 */
import { FIELD_LABEL } from '../constants/fieldLabels'

/** テーブルごとに出せる項目（DBの列名）。並びはDBの定義順に合わせてある */
const CREDITOR_FIELDS = [
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

const PAYMENT_FIELDS = [
  'id', 'caseId', 'creditorId', 'creditorInstallmentIndex', 'plannedDate', 'plannedAmount',
  'plannedFeeAllocation', 'plannedAgentFeeAllocation', 'plannedPoolAllocation',
  'plannedRepaymentAllocation', 'actualDate', 'actualAmount', 'actualFeeAllocation',
  'actualAgentFeeAllocation', 'actualPoolAllocation', 'actualRepaymentAllocation',
  'handlingFee', 'repaymentCount', 'repaymentDate', 'actualRepaymentCount', 'actualHandlingFee',
  'cumulativePool',
]

const CONTACT_FIELDS = [
  'id', 'caseId', 'contactDate', 'contactTime', 'staff', 'tool', 'targetType', 'creditorName', 'comment',
]

const label = (f: string) => FIELD_LABEL[f] ?? f
const toFields = (keys: string[]) => keys.map((k) => ({ key: k, label: label(k) }))

export const CSV_TABLES = [
  { key: 'creditor', label: '債権者（和解状況）', fields: toFields(CREDITOR_FIELDS) },
  { key: 'payment', label: '入金スケジュール', fields: toFields(PAYMENT_FIELDS) },
  { key: 'contact', label: '接触履歴', fields: toFields(CONTACT_FIELDS) },
]

/** サーバでCSVを作ってもらい、そのまま保存する */
export async function downloadCaseCsvWithTables(sel: {
  caseFields: string[]
  tables: Record<string, string[]>
}): Promise<void> {
  const r = await fetch('/api/cases/export-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseFields: sel.caseFields, tables: sel.tables }),
  })
  if (!r.ok) {
    window.alert('CSVを作成できませんでした')
    return
  }
  const blob = await r.blob()
  const now = new Date()
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `案件一覧_${ymd}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
