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

/**
 * 変更履歴の日時表示。
 * サーバは createdAt を UTC の ISO 文字列で返すため、以前のように文字列を
 * そのまま切り出すと日本時間より9時間ずれた時刻が出ていた
 * （事務所から「更新時間と全く違う時間が表示される」とのご指摘。宮川様 2026-08-24）。
 */
function formatJst(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const ENTITY_LABEL: Record<string, { label: string; cls: string }> = {
  Case: { label: '案件', cls: 'bg-slate-100 text-slate-600' },
  Creditor: { label: '債権者', cls: 'bg-indigo-100 text-indigo-700' },
  Payment: { label: '入金', cls: 'bg-emerald-100 text-emerald-700' },
  ContactHistory: { label: '接触履歴', cls: 'bg-sky-100 text-sky-700' },
  CaseReminder: { label: 'リマインド', cls: 'bg-amber-100 text-amber-700' },
}

const FIELD_LABEL: Record<string, string> = {
  dueDate: '期日',
  body: '内容',
  done: '対応済み',
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
  expectedSettlement: '想定和解回数',
  status: 'ステータス',
  acceptanceNoticeSentDate: '受任通知送付日',
  debtInquiryArrivalDate: '債権調査到着日',
  customerCode: '顧客コード',
  contractDate: '契約日',
  settlementProposal: '和解提案回数',
  responseStatus: '回答状況',
  settlementDate: '和解日',
  settlementAmount: '和解金額',
  settlementDebtAmount: '和解時債務額',
  settlementContentComment: '和解内容',
  nextProcessDate: '次回処理日時',
  fundIncreaseAction: '原資UP対応',
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

/** 「このバージョンに戻す」の下見（サーバが返す、戻る内容） */
type RestorePreview = {
  entity: string
  createdAt: string
  /** この履歴より後の変更の件数。まとめて取り消される */
  laterCount: number
  items: { field: string; from: unknown; to: unknown }[]
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
  /*
    変更箇所は既定で折りたたむ（事務所のご要望 2026-09-02。kintone と同じ）。
    以前は全ての履歴で変更前→変更後を常に開いていたため、更新の多い案件では
    枠が縦に長くなり「いつ誰が何をしたか」を追いにくかった。
    ここに入っている id の履歴だけを開く。
  */
  const [opened, setOpened] = useState<Set<string>>(new Set())
  /** 「このバージョンに戻す」の確認。実行前に何がどう戻るかを出す */
  const [restore, setRestore] = useState<{ id: string; preview: RestorePreview } | null>(null)

  const toggle = (id: string) =>
    setOpened((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const load = useCallback(() => {
    fetch(`/api/cases/${caseId}/changes`)
      .then((r) => (r.ok ? (r.json() as Promise<ChangeEntry[]>) : []))
      .then(setChanges)
      .catch(() => setChanges([]))
  }, [caseId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  /** その1件だけを打ち消す（従来の動き） */
  const revert = async (id: string) => {
    if (!window.confirm('この変更だけを取り消しますか？')) return
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

  /** 「このバージョンに戻す」。まず戻る内容を取りに行き、確認してから実行する */
  const askRestore = async (id: string) => {
    setBusy(id)
    try {
      const r = await fetch(`/api/changes/${id}/restore-preview`)
      const d = (await r.json().catch(() => ({}))) as RestorePreview & { error?: string }
      if (!r.ok) {
        window.alert(d.error ?? 'この履歴には戻せません')
        return
      }
      if (!d.items || d.items.length === 0) {
        window.alert('すでにこの版の状態です。戻す項目はありません。')
        return
      }
      setRestore({ id, preview: d })
    } finally {
      setBusy(null)
    }
  }

  const doRestore = async () => {
    if (!restore) return
    setBusy(restore.id)
    try {
      const r = await fetch(`/api/changes/${restore.id}/restore`, { method: 'POST' })
      if (r.ok) {
        setRestore(null)
        load()
        onReverted()
      } else {
        const d = (await r.json().catch(() => ({}))) as { error?: string }
        window.alert(d.error ?? '戻せませんでした')
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
    <>
      <ul className="max-h-80 divide-y divide-slate-100 overflow-auto">
        {changes.map((c) => {
          const keys = Object.keys(c.after ?? c.before ?? {})
          const isOpen = opened.has(c.id)
          const label = (k: string) => FIELD_LABEL[k] ?? k
          // 折りたたみ中の1行まとめ。「何を変えたか」だけ分かればよい
          const summary =
            keys.length === 0
              ? '内容なし'
              : keys.length <= 2
                ? keys.map(label).join('・')
                : `${keys.slice(0, 2).map(label).join('・')} ほか${keys.length - 2}項目`
          return (
            <li key={c.id} className="px-3 py-2 text-xs">
              <div className="flex items-center gap-1 text-[0.625rem] text-slate-400">
                <span
                  className={`rounded px-1 py-0.5 font-medium ${
                    ENTITY_LABEL[c.entity ?? 'Case']?.cls ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {ENTITY_LABEL[c.entity ?? 'Case']?.label ?? c.entity}
                </span>
                {c.action === 'CREATE' && <span className="text-emerald-600">追加</span>}
                {c.action === 'DELETE' && <span className="text-red-600">削除</span>}
                {formatJst(c.createdAt)} ・ {c.actor}
                {c.reverted && <span className="ml-1 text-amber-600">（取消済）</span>}
              </div>
              <div className="mt-0.5 text-slate-700">{summary}</div>

              {/* 変更箇所（既定は閉じている） */}
              {isOpen && (
                <div className="mt-1 space-y-0.5 rounded bg-slate-50 px-2 py-1">
                  {keys.map((k) => (
                    <div key={k} className="text-slate-700">
                      <span className="text-slate-500">{label(k)}:</span>{' '}
                      <span className="text-slate-400 line-through">{fmt(c.before?.[k])}</span>
                      {' → '}
                      <span className="font-medium">{fmt(c.after?.[k])}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-1 flex flex-wrap items-center gap-3 text-[0.6875rem]">
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="text-blue-600 hover:underline"
                >
                  {isOpen ? '変更箇所を隠す' : '変更箇所を表示する'}
                </button>
                {c.action === 'UPDATE' && (
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => askRestore(c.id)}
                    className="text-blue-600 hover:underline disabled:opacity-40"
                  >
                    このバージョンに戻す
                  </button>
                )}
                {!c.reverted && c.action === 'UPDATE' && (
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => revert(c.id)}
                    className="text-slate-500 hover:underline disabled:opacity-40"
                  >
                    この変更だけ取り消す
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {/*
        「このバージョンに戻す」の確認。
        その時点より後の変更もまとめて取り消すため、何がどう戻るかを必ず見せてから実行する。
      */}
      {restore && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4"
          onClick={() => setRestore(null)}
        >
          <div
            className="mt-16 w-full max-w-lg rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-4 py-2 text-sm font-bold text-slate-800">
              このバージョンに戻す
            </div>
            <div className="px-4 py-3 text-xs text-slate-700">
              <p className="mb-2">
                {formatJst(restore.preview.createdAt)} の時点の状態に戻します。
                {restore.preview.laterCount > 0 && (
                  <>
                    <br />
                    <span className="font-bold text-red-600">
                      これより後の {restore.preview.laterCount} 件の変更もまとめて取り消されます。
                    </span>
                  </>
                )}
              </p>
              <div className="max-h-64 space-y-0.5 overflow-auto rounded border border-slate-200 bg-slate-50 px-2 py-1">
                {restore.preview.items.map((it) => (
                  <div key={it.field}>
                    <span className="text-slate-500">{FIELD_LABEL[it.field] ?? it.field}:</span>{' '}
                    <span className="text-slate-400 line-through">{fmt(it.from)}</span>
                    {' → '}
                    <span className="font-medium">{fmt(it.to)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[0.6875rem] text-slate-500">
                戻した内容も変更履歴に残るので、必要ならさらに戻せます。
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-2">
              <button
                type="button"
                onClick={() => setRestore(null)}
                className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                やめる
              </button>
              <button
                type="button"
                disabled={busy === restore.id}
                onClick={doRestore}
                className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {restore.preview.items.length}項目を戻す
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
