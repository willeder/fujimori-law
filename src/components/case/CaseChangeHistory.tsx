/**
 * 案件の変更履歴（before/after 差分）と revert（元に戻す）。
 * 案件詳細ページで表示。
 */
import { useCallback, useEffect, useState } from 'react'

type ChangeEntry = {
  id: string
  entity?: string
  action: string
  actor: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reverted: boolean
  createdAt: string
}

const ENTITY_LABEL: Record<string, { label: string; cls: string }> = {
  Case: { label: '案件', cls: 'bg-slate-100 text-slate-600' },
  Creditor: { label: '債権者', cls: 'bg-indigo-100 text-indigo-700' },
  Payment: { label: '入金', cls: 'bg-emerald-100 text-emerald-700' },
}

const FIELD_LABEL: Record<string, string> = {
  name: '氏名',
  furigana: 'フリガナ',
  phone: '電話番号',
  lineUrl: 'LINE URL',
  email: 'メール',
  postalCode: '郵便番号',
  prefecture: '都道府県',
  address: '住所',
  birthDate: '生年月日',
  age: '年齢',
  gender: '性別',
  maritalStatus: '婚姻',
  payDay: '給与日',
  monthlyIncome: '月収',
  rent: '家賃',
  cautionRank: '要注意ランク',
  appointmentStaff: 'アポ担当',
  followUpStaff: '後確担当',
  interviewStaff: '面談担当',
  judicialScrivener: '担当',
  debtAdjustmentType: '債務整理区分',
  acceptanceRank: '受任ランク',
  acceptanceDate: '受任日',
  elapsedDays: '経過日数',
  creditorCount: '債権社数',
  declaredDebtAmount: '申告債務額',
  totalDebtAmount: '債務総額',
  settlementStatus: '受任後ステータス',
  settlementProposalDate: '和解提案日',
  settlementCount: '和解件数',
  normalFee: '報酬（通常）',
  officeFee: '事務所報酬',
  uncollectedFee: '報酬未回収額',
  installmentCount: '分割回数',
  nextPaymentDate: '次回入金日',
  firstPaymentDate: '初回入金日',
  basePaymentAmount: '基本入金額',
  monthlyPaymentDay: '月入金日',
  reminderDate: 'リマインド日',
  reminderTime: 'リマインド時間',
  nextResponseDate: '次回後確日',
  responseTime: '後確時間',
  listCategory: 'リスト区分',
  listRegisteredDate: 'リスト登録日',
  acceptanceDocs: '受任書類',
  createdBy: '作成者',
  updatedBy: '更新者',
  // 案件 その他（依頼者・面談・報酬・入金）
  recordNumber: 'レコード番号',
  maidenName: '旧姓',
  children: '子供',
  residenceType: '居住形態',
  employmentType: '勤務形態',
  correspondenceRequired: '対応要否',
  correspondenceHours: '対応時間',
  cohabitation: '同居',
  confidentialContact: '内密先',
  emergencyContact: '緊急連絡先',
  emergencyContactRelation: '緊急連絡先続柄',
  previousAddress: '旧住所',
  payrollAccount: '給与口座',
  employerName: '勤務先名',
  employerContact: '勤務先連絡先',
  employerAddress: '勤務先住所',
  previousEmployerName: '旧勤務先名',
  previousEmployerContact: '旧勤務先連絡先',
  previousEmployerAddress: '旧勤務先住所',
  otherOfficeConsultation: '他事務所相談',
  paymentDelay: '遅れ',
  bicycleNote: '自転車',
  pension: '年金',
  cAcceptancePromotionDate: 'C受任昇格日',
  interviewMemo1: '面談時備考1',
  interviewMemo2: '面談時備考2',
  incomeExpenseMemo: '収支メモ',
  preRequestPayment: '依頼前返済額',
  postRequestPayment: '依頼後返済額',
  postSettlementPaymentCount: '和解後代弁社数',
  plannedPaymentCount: '予定弁済総数',
  plannedAgentCount: '予定代弁社数',
  allSettlementDocSentDate: '全和解書送付日',
  agentPayment: '弁済代行',
  plannedPaymentFeeTotal: '予定弁済報酬総額',
  firstPaymentWithinTenDays: '初回入金10日以内',
  cumulativePaymentAmount: '累計入金額',
  cumulativePlannedPayment: '累計入金予定額',
  cumulativeFeeAllocation: '累計報酬充当額',
  cumulativePlannedFeeAllocation: '累計報酬充当予定額',
  cumulativePlannedRepaymentAllocation: '累計弁済充当予定額',
  cumulativePlannedPoolAllocation: '累計プール充当予定額',
  cumulativeAgentFeeAllocation: '累計弁代報酬充当額',
  cumulativePlannedAgentFeeAllocation: '累計弁代報酬充当予定額',
  cumulativeHandlingFee: '累計手数料',
  cumulativePoolAllocation: '累計プール充当額',
  cumulativeRepaymentAllocation: '累計弁済充当額',
  totalMinusPoolMinusRepayment: '総額-プール-累弁済',
  notificationExcluded: '催促通知除外',
  vAccountBranch: 'V口座支店',
  vAccountNumber: 'V口座番号',
  // 債権者（Creditor）
  creditorName: '債権者名',
  negotiationPartner: '交渉相手',
  declaredAmount: '申告額',
  debtAmount: '債務額',
  expectedSettlement: '想定和解',
  status: 'ステータス',
  acceptanceNoticeSentDate: '受任通知送付日',
  debtInquiryArrivalDate: '債権調査到着日',
  customerCode: '顧客コード',
  contractDate: '契約日',
  settlementProposal: '和解提案',
  responseStatus: '回答状況',
  settlementDate: '和解日',
  settlementAmount: '和解額',
  settlementDebtAmount: '和解時債務額',
  settlementContentComment: '和解内容',
  nextProcessDate: '次回処理日時',
  memo: 'メモ',
  paymentStartMonth: '支払開始日',
  paymentDay: '支払日',
  firstPaymentAmount: '初回支払額',
  subsequentPaymentAmount: '2回目以降額',
  bankName: '銀行',
  branchName: '支店',
  accountType: '口座種別',
  accountNumber: '口座番号',
  accountHolder: '口座名義',
  // 入金（Payment）
  plannedDate: '予定日',
  plannedAmount: '予定額',
  actualDate: '実入金日',
  actualAmount: '実入金額',
  plannedFeeAllocation: '予定報酬充当',
  actualFeeAllocation: '報酬充当',
  plannedPoolAllocation: '予定プール充当',
  actualPoolAllocation: 'プール充当',
  plannedRepaymentAllocation: '予定弁済充当',
  actualRepaymentAllocation: '弁済充当',
  handlingFee: '手数料',
  repaymentCount: '社数（予定）',
  repaymentDate: '弁済日',
  actualRepaymentCount: '社数（実績）',
  actualHandlingFee: '振)手数料',
  // 債権者・入金 その他
  expectedSettlementAmount: '想定和解額',
  expectedPaymentCount: '想定弁済回数',
  expectedFutureInterest: '想定将来利息',
  check: 'チェック',
  reminder: 'リマインド',
  paymentCount: '弁済回数',
  finalPaymentAmount: '最終回支払額',
  finalPaymentMonth: '最終支払日',
  futureInterest: '将来利息',
  financialInstitutionCode: '金融機関コード',
  branchCode: '支店コード',
  designatedCode: '指定コード',
  repaymentTarget: '弁済対象',
  creditorInstallmentIndex: '回次',
  plannedAgentFeeAllocation: '予定弁代報酬充当',
  actualAgentFeeAllocation: '弁代報酬充当',
  cumulativePool: '累計プール',
}

const fmt = (v: unknown) =>
  v === null || v === undefined || v === '' ? '空' : String(v)

export function CaseChangeHistory({
  caseId,
  refreshKey,
  onReverted,
}: {
  caseId: number
  refreshKey: number
  onReverted: () => void
}) {
  const [changes, setChanges] = useState<ChangeEntry[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/cases/${caseId}/changes`)
      .then((r) => (r.ok ? (r.json() as Promise<ChangeEntry[]>) : []))
      .then(setChanges)
      .catch(() => setChanges([]))
  }, [caseId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const revert = async (id: string) => {
    if (!window.confirm('この変更を元に戻しますか？')) return
    setBusy(id)
    try {
      const r = await fetch(`/api/changes/${id}/revert`, { method: 'POST' })
      if (r.ok) {
        load()
        onReverted()
      } else {
        const d = (await r.json().catch(() => ({}))) as { error?: string }
        window.alert(d.error ?? '元に戻せませんでした')
      }
    } finally {
      setBusy(null)
    }
  }

  if (changes === null)
    return <p className="px-3 py-3 text-xs text-slate-400">変更履歴を読み込み中…</p>
  if (changes.length === 0)
    return <p className="px-3 py-3 text-xs text-slate-400">変更履歴はありません。</p>

  return (
    <ul className="max-h-80 divide-y divide-slate-100 overflow-auto">
      {changes.map((c) => {
        const keys = Object.keys(c.after ?? c.before ?? {})
        return (
          <li key={c.id} className="flex items-start justify-between gap-2 px-3 py-2 text-xs">
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <span
                  className={`rounded px-1 py-0.5 font-medium ${
                    ENTITY_LABEL[c.entity ?? 'Case']?.cls ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {ENTITY_LABEL[c.entity ?? 'Case']?.label ?? c.entity}
                </span>
                {c.action === 'CREATE' && <span className="text-emerald-600">追加</span>}
                {c.action === 'DELETE' && <span className="text-red-600">削除</span>}
                {c.createdAt.slice(0, 16).replace('T', ' ')} ・ {c.actor}
                {c.reverted && <span className="ml-1 text-amber-600">（取消済）</span>}
              </div>
              <div className="mt-0.5 space-y-0.5">
                {keys.map((k) => (
                  <div key={k} className="text-slate-700">
                    <span className="text-slate-500">{FIELD_LABEL[k] ?? k}:</span>{' '}
                    <span className="text-slate-400 line-through">{fmt(c.before?.[k])}</span>
                    {' → '}
                    <span className="font-medium">{fmt(c.after?.[k])}</span>
                  </div>
                ))}
              </div>
            </div>
            {!c.reverted && c.action === 'UPDATE' && (
              <button
                type="button"
                disabled={busy === c.id}
                onClick={() => revert(c.id)}
                className="shrink-0 rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                元に戻す
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
