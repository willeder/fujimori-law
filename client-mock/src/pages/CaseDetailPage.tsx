import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { NavigateFunction } from 'react-router-dom'
import {
  useCase,
  useContactHistoriesByCaseId,
  useCreditorsByCaseId,
  usePaymentsByCaseId,
  useCaseDispatch,
} from '../store/useCaseStore'
import {
  SectionCard,
  EditableField,
  StatusBadge,
  Tabs,
} from '../components'
import { CreditorTab } from './CreditorTab'
import { ContactHistoryTable } from './ContactHistoryTable'
import { PaymentTable } from './PaymentTable'
import { SettlementFiles } from '../components/case/SettlementFiles'
import type { Case } from '../types'
import {
  creditorTabAccentSummary,
  creditorTabAccentForName,
} from '../lib/creditorTabAccent'

function formatYenPair(left: number | null, right: number | null) {
  const l = left != null ? `${left.toLocaleString()}円` : '-'
  const r = right != null ? `${right.toLocaleString()}円` : '-'
  return (
    <span className="tabular-nums">
      {l} <span className="font-normal text-slate-400">/</span> {r}
    </span>
  )
}

function formatDatePair(left: string | null, right: string | null) {
  const l = left && left.length > 0 ? left : '-'
  const r = right && right.length > 0 ? right : '-'
  return (
    <span className="tabular-nums">
      {l} <span className="font-normal text-slate-400">/</span> {r}
    </span>
  )
}

type VAccountFieldsProps = {
  branch: string | null
  number: string | null
  onSave: (branch: string | null, number: string | null) => void
}

/** Ⅴ口座：未登録は入力→登録、登録後は参照＋変更時のみ確認付き更新 */
function VAccountFields({ branch, number, onSave }: VAccountFieldsProps) {
  const [editing, setEditing] = useState(false)
  const [draftB, setDraftB] = useState(branch ?? '')
  const [draftN, setDraftN] = useState(number ?? '')
  const snapshotRef = useRef({ b: '', n: '' })

  const savedLocked =
    (branch ?? '').trim().length > 0 && (number ?? '').trim().length > 0

  useEffect(() => {
    if (!editing) {
      setDraftB(branch ?? '')
      setDraftN(number ?? '')
    }
  }, [branch, number, editing])

  const startChange = () => {
    snapshotRef.current = {
      b: (branch ?? '').trim(),
      n: (number ?? '').trim(),
    }
    setDraftB(branch ?? '')
    setDraftN(number ?? '')
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraftB(branch ?? '')
    setDraftN(number ?? '')
    setEditing(false)
  }

  const commit = () => {
    const b = draftB.trim() || null
    const n = draftN.trim() || null
    const { b: prevB, n: prevN } = snapshotRef.current
    const hadSaved = prevB !== '' && prevN !== ''
    const dirty = (b ?? '') !== prevB || (n ?? '') !== prevN
    if (hadSaved && dirty) {
      const ok = window.confirm(
        'V口座情報の値が変更されます。承認した内容で保存しますか？\n「キャンセル」を選ぶと、変更は破棄され元の値に戻ります。'
      )
      if (!ok) {
        cancelEdit()
        return
      }
    }
    onSave(b, n)
    setEditing(false)
  }

  const registerFirst = () => {
    const b = draftB.trim() || null
    const n = draftN.trim() || null
    if (!b || !n) return
    onSave(b, n)
  }

  const inputCls =
    'w-full max-w-xs rounded border border-slate-200 px-2 py-1 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400'

  if (savedLocked && !editing) {
    return (
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <div className="text-xs font-medium text-slate-500">Ⅴ口座情報</div>
        <div className="flex flex-col gap-1 text-sm text-slate-800 sm:flex-row sm:flex-wrap sm:gap-x-4">
          <span>
            <span className="text-slate-500">V口座-支店</span>{' '}
            <span className="font-medium">{branch}</span>
          </span>
          <span>
            <span className="text-slate-500">V口座-番号</span>{' '}
            <span className="font-medium">{number}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={startChange}
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          変更
        </button>
      </div>
    )
  }

  if (savedLocked && editing) {
    return (
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <div className="text-xs font-medium text-slate-500">Ⅴ口座情報（変更）</div>
        <label className="block text-sm">
          <span className="text-slate-500">V口座-支店</span>
          <input
            className={`${inputCls} mt-0.5 block`}
            value={draftB}
            onChange={(e) => setDraftB(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-500">V口座-番号</span>
          <input
            className={`${inputCls} mt-0.5 block`}
            value={draftN}
            onChange={(e) => setDraftN(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={commit}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            確定
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <div className="text-xs font-medium text-slate-500">Ⅴ口座情報</div>
      <label className="block text-sm">
        <span className="text-slate-500">V口座-支店</span>
        <input
          className={`${inputCls} mt-0.5 block`}
          value={draftB}
          onChange={(e) => setDraftB(e.target.value)}
          placeholder="未入力"
          autoComplete="off"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-500">V口座-番号</span>
        <input
          className={`${inputCls} mt-0.5 block`}
          value={draftN}
          onChange={(e) => setDraftN(e.target.value)}
          placeholder="未入力"
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        onClick={registerFirst}
        disabled={!draftB.trim() || !draftN.trim()}
        className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        登録
      </button>
    </div>
  )
}

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-200">
        <p className="text-slate-500">案件が見つかりません</p>
      </div>
    )
  }
  return <CaseDetailBody key={id} id={id} navigate={navigate} />
}

function CaseDetailBody({
  id,
  navigate,
}: {
  id: string
  navigate: NavigateFunction
}) {
  const caseData = useCase(Number(id))
  const creditors = useCreditorsByCaseId(Number(id))
  const contactHistories = useContactHistoriesByCaseId(Number(id))
  const payments = usePaymentsByCaseId(Number(id))
  const caseLevelPayments = useMemo(
    () => payments.filter((p) => p.creditorId == null),
    [payments]
  )
  const unpaidPlannedDates = useMemo(
    () =>
      caseLevelPayments
        .filter((p) => Boolean(p.plannedDate) && !p.actualDate)
        .map((p) => p.plannedDate as string)
        .sort(),
    [caseLevelPayments]
  )
  const displayNextPaymentDate = useMemo(() => {
    if (!caseData) return null
    const trimmed = caseData.paymentInfo.nextPaymentDate?.trim() ?? ''
    if (trimmed.length > 0) return caseData.paymentInfo.nextPaymentDate
    return unpaidPlannedDates.length > 0 ? unpaidPlannedDates[0] : null
  }, [caseData, unpaidPlannedDates])
  const dispatch = useCaseDispatch()

  /** 和解対象債権と入金予定履歴で共有（同じ id・同じ並び） */
  const [creditorScopeTabId, setCreditorScopeTabId] = useState('all')
  const displayCreditorScopeTabId =
    creditorScopeTabId === 'all' ||
    creditors.some((c) => String(c.id) === creditorScopeTabId)
      ? creditorScopeTabId
      : 'all'

  const settlementTabs = useMemo(() => {
    if (!caseData) return []
    return [
      {
        id: 'all',
        label: 'すべて合算',
        accent: creditorTabAccentSummary(),
        content: (
          <CreditorTab
            caseId={caseData.id}
            creditors={creditors}
            view="summary"
          />
        ),
      },
      ...creditors.map((c) => ({
        id: String(c.id),
        label: c.creditorName,
        badge: c.status === '和解済' ? '済' : undefined,
        accent: creditorTabAccentForName(c.creditorName, c.id),
        content: (
          <CreditorTab
            caseId={caseData.id}
            creditors={[c]}
            view="detail"
          />
        ),
      })),
    ]
  }, [caseData, creditors])

  const paymentTabs = useMemo(() => {
    if (!caseData) return []
    return [
      {
        id: 'all',
        label: 'すべて合算',
        accent: creditorTabAccentSummary(),
        content: (
          <PaymentTable
            caseId={caseData.id}
            payments={caseLevelPayments}
            scheduleCreditorId={null}
            showAggregateSummary
          />
        ),
      },
      ...creditors.map((c) => ({
        id: String(c.id),
        label: c.creditorName,
        badge: c.status === '和解済' ? '済' : undefined,
        accent: creditorTabAccentForName(c.creditorName, c.id),
        content: (
          <PaymentTable
            caseId={caseData.id}
            payments={payments.filter((p) => p.creditorId === c.id)}
            scheduleCreditorId={c.id}
            showAggregateSummary={false}
          />
        ),
      })),
    ]
  }, [caseData, caseLevelPayments, creditors, payments])

  if (!caseData) {
    return (
      <div className="min-h-screen bg-slate-200 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 mb-4">案件が見つかりません</p>
          <button
            onClick={() => navigate('/')}
            className="text-blue-500 hover:text-blue-600"
          >
            一覧に戻る
          </button>
        </div>
      </div>
    )
  }

  const updateCase = (updates: Partial<Case>) => {
    dispatch({
      type: 'UPDATE_CASE',
      payload: { ...caseData, ...updates },
    })
  }

  const updateClientBasicInfo = (
    field: keyof Case['clientBasicInfo'],
    value: string
  ) => {
    updateCase({
      clientBasicInfo: {
        ...caseData.clientBasicInfo,
        [field]: value || null,
      },
    })
  }

  const updatePaymentInfo = (
    field: keyof Case['paymentInfo'],
    value: string
  ) => {
    const numericFields = [
      'firstPaymentAmount',
      'basePaymentAmount',
      'cumulativePaymentAmount',
    ]
    updateCase({
      paymentInfo: {
        ...caseData.paymentInfo,
        [field]: numericFields.includes(field) ? Number(value) || null : value || null,
      },
    })
  }

  const updateAppointmentInfo = (
    field: keyof Case['appointmentInfo'],
    value: string
  ) => {
    updateCase({
      appointmentInfo: {
        ...caseData.appointmentInfo,
        [field]: value || null,
      },
    })
  }

  const updateFeeInfo = (field: keyof Case['feeInfo'], value: string) => {
    const numericFields: (keyof Case['feeInfo'])[] = [
      'normalFee',
      'officeFee',
      'installmentCount',
      'plannedPaymentFeeTotal',
      'uncollectedFee',
    ]
    updateCase({
      feeInfo: {
        ...caseData.feeInfo,
        [field]: numericFields.includes(field) ? Number(value) || null : value || null,
      },
    })
  }

  const updateMetadata = (field: keyof Case['metadata'], value: string) => {
    updateCase({
      metadata: {
        ...caseData.metadata,
        [field]: value || null,
      },
    })
  }

  // 入金サマリ用の計算値（案件全体行のみ。債権者別行は二重計上しない）
  const plannedDates = caseLevelPayments
    .map((p) => p.plannedDate)
    .filter((d): d is string => Boolean(d))
  const finalPlannedDate =
    plannedDates.length > 0 ? plannedDates.reduce((a, b) => (a > b ? a : b)) : null

  const sumActualAgentFee = caseLevelPayments.reduce(
    (s, p) => s + (p.actualAgentFeeAllocation ?? 0),
    0
  )
  const sumActualPool = caseLevelPayments.reduce(
    (s, p) => s + (p.actualPoolAllocation ?? 0),
    0
  )
  const sumActualRepayment = caseLevelPayments.reduce(
    (s, p) => s + (p.actualRepaymentAllocation ?? 0),
    0
  )
  const sumPlannedRepayment = caseLevelPayments.reduce(
    (s, p) => s + (p.plannedRepaymentAllocation ?? 0),
    0
  )

  const cumulativePaid = caseData.paymentInfo.cumulativePaymentAmount ?? 0
  const cumulativePlanned = caseData.paymentInfo.cumulativePlannedPayment ?? 0
  const remainingPlanned =
    caseData.paymentInfo.cumulativePlannedPayment != null &&
    caseData.paymentInfo.cumulativePaymentAmount != null
      ? cumulativePlanned - cumulativePaid
      : null

  // 和解済み社数を計算
  const settledCount = creditors.filter((c) =>
    ['和解済', '弁済中', '完済'].includes(c.status)
  ).length
  const totalCreditors = creditors.length

  const lineUrlRaw = caseData.clientBasicInfo.lineUrl?.trim() ?? ''
  const lineHref =
    lineUrlRaw.length > 0
      ? /^https?:\/\//i.test(lineUrlRaw)
        ? lineUrlRaw
        : `https://${lineUrlRaw}`
      : null
  const displayCaseId =
    caseData.metadata.externalId != null && String(caseData.metadata.externalId).length > 0
      ? String(caseData.metadata.externalId)
      : String(caseData.id)

  return (
    <div className="flex min-h-screen min-h-0 flex-col bg-slate-200">
      {/* Header（スクロール時に固定） */}
      <header className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-6 py-1.5 text-xs text-slate-800">
          <Link
            to="/"
            className="shrink-0 text-slate-400 hover:text-slate-600"
            aria-label="一覧に戻る"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="shrink-0">
            <span className="text-slate-500">ID</span>{' '}
            <span className="font-medium">{displayCaseId}</span>
          </span>
          <span className="shrink-0">
            <span className="text-slate-500">名前</span>{' '}
            <span className="font-medium">{caseData.clientBasicInfo.name ?? '-'}</span>
          </span>
          <span className="shrink-0">
            <span className="text-slate-500">フリガナ</span>{' '}
            <span className="font-medium">{caseData.clientBasicInfo.furigana ?? '-'}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-slate-500">受任後ステータス</span>
            <StatusBadge status={caseData.settlementInfo.status} size="sm" />
          </span>
          <span className="shrink-0">
            <span className="text-slate-500">電話番号</span>{' '}
            <span className="font-medium">{caseData.clientBasicInfo.phone ?? '-'}</span>
          </span>
          <span className="min-w-0 shrink">
            <span className="text-slate-500">メールアドレス</span>{' '}
            <span className="font-medium break-all">{caseData.clientBasicInfo.email ?? '-'}</span>
          </span>
          <span className="shrink-0">
            <span className="text-slate-500">要注意ランク</span>{' '}
            <span className="font-medium">{caseData.clientBasicInfo.cautionRank ?? '-'}</span>
          </span>
          <div className="ml-auto shrink-0">
            {lineHref ? (
              <a
                href={lineHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md bg-[#06C755] px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:opacity-90"
              >
                LINE@
              </a>
            ) : (
              <span className="text-slate-400">LINE@未設定</span>
            )}
          </div>
        </div>
        {/* ② リスト・受任（1行） */}
        <div className="border-b border-slate-100 px-6 py-1.5">
          <div className="flex flex-nowrap items-center gap-x-1 overflow-x-auto pb-0.5">
            <div className="min-w-[4rem] shrink-0">
              <EditableField
                compact
                label="リスト登録日"
                value={caseData.metadata.listRegisteredDate}
                onChange={(v) => updateMetadata('listRegisteredDate', v)}
                type="date"
              />
            </div>
            <div className="min-w-[4rem] shrink-0">
              <EditableField
                compact
                label="リスト区分"
                value={caseData.metadata.listCategory}
                onChange={(v) => updateMetadata('listCategory', v)}
              />
            </div>
            <div className="min-w-[4rem] shrink-0">
              <EditableField
                compact
                label="受任日"
                value={caseData.appointmentInfo.acceptanceDate}
                onChange={(v) => updateAppointmentInfo('acceptanceDate', v)}
                type="date"
              />
            </div>
            <div className="min-w-[4rem] shrink-0">
              <EditableField
                compact
                label="面談担当"
                value={caseData.appointmentInfo.interviewStaff}
                onChange={(v) => updateAppointmentInfo('interviewStaff', v)}
              />
            </div>
            <div className="min-w-[4rem] shrink-0">
              <EditableField
                compact
                label="受任ランク"
                value={caseData.appointmentInfo.acceptanceRank}
                onChange={(v) => updateAppointmentInfo('acceptanceRank', v)}
                type="select"
                options={[
                  { value: 'A', label: 'A' },
                  { value: 'B', label: 'B' },
                  { value: 'C', label: 'C' },
                ]}
              />
            </div>
          </div>
        </div>
        {/* ③ 報酬・入金（1行） */}
        <div className="px-6 py-1.5">
          <div className="flex flex-nowrap items-center gap-x-1 overflow-x-auto pb-0.5">
            <div className="min-w-[4rem] shrink-0">
              <EditableField
                compact
                label="通常報酬"
                value={caseData.feeInfo.normalFee}
                onChange={(v) => updateFeeInfo('normalFee', v)}
                type="number"
                suffix="円"
              />
            </div>
            <div className="min-w-[4rem] shrink-0">
              <EditableField
                compact
                label="報酬分割回数"
                value={caseData.feeInfo.installmentCount}
                onChange={(v) => updateFeeInfo('installmentCount', v)}
                type="number"
                suffix="回"
              />
            </div>
            <div className="min-w-[4rem] shrink-0">
              <EditableField
                compact
                label="毎月入金日"
                value={caseData.paymentInfo.monthlyPaymentDay}
                onChange={(v) => updatePaymentInfo('monthlyPaymentDay', v)}
              />
            </div>
            <div className="min-w-[4rem] shrink-0">
              <EditableField
                compact
                label="基本入金額"
                value={caseData.paymentInfo.basePaymentAmount}
                onChange={(v) => updatePaymentInfo('basePaymentAmount', v)}
                type="number"
                suffix="円"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Content（ヘッダー以外のみスクロール） */}
      <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="p-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Left Column - Summary */}
          <div className="lg:col-span-1 space-y-3">
            {/* ② 入金管理をメインにするため、入金状況サマリを最上部へ */}
            <SectionCard title="入金状況" color="blue">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-sm text-slate-600">累計入金額</span>
                  <span className="min-w-0 truncate text-right text-xl font-bold text-blue-600">
                    {formatYenPair(
                      caseData.paymentInfo.cumulativePaymentAmount,
                      caseData.paymentInfo.cumulativePlannedPayment
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="shrink-0 text-slate-500">残入金予定額</span>
                  <span className="min-w-0 truncate text-right font-medium tabular-nums">
                    {remainingPlanned != null ? `${remainingPlanned.toLocaleString()}円` : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="shrink-0 text-slate-500">次回／最終入金予定日</span>
                  <span className="min-w-0 truncate text-right font-medium">
                    {formatDatePair(displayNextPaymentDate, finalPlannedDate)}
                  </span>
                </div>
                <hr className="border-slate-100" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-sm text-slate-600">
                    報酬充当額{' '}
                    <span className="font-medium text-slate-900">
                      {caseData.paymentInfo.cumulativeFeeAllocation?.toLocaleString() ?? '-'}
                    </span>
                    <span className="text-slate-400 ml-1">円</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    報酬未回収額{' '}
                    <span className="font-medium text-slate-900">
                      {caseData.feeInfo.uncollectedFee?.toLocaleString() ?? '-'}
                    </span>
                    <span className="text-slate-400 ml-1">円</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    弁代報酬充当額{' '}
                    <span className="font-medium text-slate-900">
                      {sumActualAgentFee.toLocaleString()}
                    </span>
                    <span className="text-slate-400 ml-1">円</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    ﾌﾟｰﾙ充当額{' '}
                    <span className="font-medium text-slate-900">
                      {sumActualPool.toLocaleString()}
                    </span>
                    <span className="text-slate-400 ml-1">円</span>
                  </div>
                  <div className="min-w-0 text-sm text-slate-600 sm:col-span-2">
                    <span className="block text-slate-600">弁済充当額</span>
                    <span className="font-medium text-slate-900">
                      {formatYenPair(sumActualRepayment, sumPlannedRepayment)}
                    </span>
                  </div>
                </div>
                <VAccountFields
                  branch={caseData.paymentInfo.vAccountBranch}
                  number={caseData.paymentInfo.vAccountNumber}
                  onSave={(b, n) =>
                    updateCase({
                      paymentInfo: {
                        ...caseData.paymentInfo,
                        vAccountBranch: b,
                        vAccountNumber: n,
                      },
                    })
                  }
                />
              </div>
            </SectionCard>

            {/* ⑤ 入金予定履歴が長くなるため、受任資料を左カラムへ */}
            <SectionCard title="受任資料" color="slate" collapsible defaultOpen={false}>
              <SettlementFiles caseId={caseData.id} />
            </SectionCard>

            {/* 依頼者基本情報（折りたたみ） */}
            <SectionCard
              title="依頼者基本情報"
              color="slate"
              collapsible
              defaultOpen={false}
            >
              <div className="grid grid-cols-2 gap-4">
                <EditableField
                  label="氏名"
                  value={caseData.clientBasicInfo.name}
                  onChange={(v) => updateClientBasicInfo('name', v)}
                />
                <EditableField
                  label="フリガナ"
                  value={caseData.clientBasicInfo.furigana}
                  onChange={(v) => updateClientBasicInfo('furigana', v)}
                />
                <EditableField
                  label="電話番号"
                  value={caseData.clientBasicInfo.phone}
                  onChange={(v) => updateClientBasicInfo('phone', v)}
                />
                <EditableField
                  label="メールアドレス"
                  value={caseData.clientBasicInfo.email}
                  onChange={(v) => updateClientBasicInfo('email', v)}
                />
                <EditableField
                  label="都道府県"
                  value={caseData.clientBasicInfo.prefecture}
                  onChange={(v) => updateClientBasicInfo('prefecture', v)}
                />
                <EditableField
                  label="年齢"
                  value={caseData.clientBasicInfo.age}
                  onChange={(v) => updateClientBasicInfo('age', v)}
                  type="number"
                  suffix="歳"
                />
                <EditableField
                  label="性別"
                  value={caseData.clientBasicInfo.gender}
                  onChange={(v) => updateClientBasicInfo('gender', v)}
                  type="select"
                  options={[
                    { value: '男', label: '男' },
                    { value: '女', label: '女' },
                  ]}
                />
                <EditableField
                  label="婚姻状況"
                  value={caseData.clientBasicInfo.maritalStatus}
                  onChange={(v) => updateClientBasicInfo('maritalStatus', v)}
                  type="select"
                  options={[
                    { value: '既婚', label: '既婚' },
                    { value: '未婚', label: '未婚' },
                    { value: '離婚', label: '離婚' },
                  ]}
                />
                <EditableField
                  label="居住形態"
                  value={caseData.clientBasicInfo.residenceType}
                  onChange={(v) => updateClientBasicInfo('residenceType', v)}
                />
                <EditableField
                  label="月収（手取り）"
                  value={caseData.clientBasicInfo.monthlyIncome}
                  onChange={(v) => updateClientBasicInfo('monthlyIncome', v)}
                  type="number"
                  suffix="円"
                />
              </div>
            </SectionCard>

            {/* 債務情報 */}
            <SectionCard title="債務情報" color="amber" collapsible defaultOpen={false}>
              <div className="grid grid-cols-2 gap-4">
                <EditableField
                  label="債権社数"
                  value={caseData.debtInfo.creditorCount}
                  onChange={() => {}}
                  disabled
                  suffix="社"
                />
                <EditableField
                  label="申告債務額"
                  value={caseData.debtInfo.declaredDebtAmount}
                  onChange={() => {}}
                  disabled
                  suffix="円"
                />
                <EditableField
                  label="債務額総額"
                  value={caseData.debtInfo.totalDebtAmount}
                  onChange={() => {}}
                  disabled
                  suffix="円"
                />
                <EditableField
                  label="依頼前返済額"
                  value={caseData.debtInfo.preRequestPayment}
                  onChange={() => {}}
                  disabled
                  suffix="円"
                />
              </div>
            </SectionCard>
          </div>

          {/* Right Column - 和解・入金（カード内タブで切替） */}
          <div className="lg:col-span-2">
            <SectionCard title="和解・入金" color="green">
              <Tabs
                tabs={[
                  {
                    id: 'payments',
                    label: '入金予定履歴',
                    content: (
                      <div>
                        <Tabs
                          tabs={paymentTabs}
                          defaultTab="all"
                          activeTabId={displayCreditorScopeTabId}
                          onActiveTabChange={setCreditorScopeTabId}
                          density="dense"
                        />
                      </div>
                    ),
                  },
                  {
                    id: 'settlement',
                    label: '和解対象債権',
                    content: (
                      <div>
                        <div className="mb-3 text-sm text-slate-600">
                          債権者数：{totalCreditors}社（うち和解済：{settledCount}社）
                        </div>
                        <Tabs
                          tabs={settlementTabs}
                          defaultTab="all"
                          activeTabId={displayCreditorScopeTabId}
                          onActiveTabChange={setCreditorScopeTabId}
                          density="dense"
                        />
                      </div>
                    ),
                  },
                ]}
                defaultTab="payments"
                variant="split"
              />
            </SectionCard>
          </div>
        </div>

        {/* 依頼者 接触履歴（下部：読みやすさ優先） */}
        <div className="mt-3">
          <SectionCard
            title="依頼者 接触履歴"
            color="slate"
            collapsible
            defaultOpen={false}
          >
            <ContactHistoryTable
              caseId={caseData.id}
              histories={contactHistories.filter((h) => h.targetType === '依頼者')}
            />
          </SectionCard>
        </div>
      </div>
      </main>
    </div>
  )
}
