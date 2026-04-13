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
import { LineUrlQuickEdit } from '../components/case/LineUrlQuickEdit'
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

/** バーチャル口座：未登録は入力→登録、登録後は参照＋変更時のみ確認付き更新 */
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
        'バーチャル口座情報の値が変更されます。承認した内容で保存しますか？\n「キャンセル」を選ぶと、変更は破棄され元の値に戻ります。'
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
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-slate-800">
          <span className="min-w-0">
            <span className="text-slate-500">支店：</span>
            <span className="font-medium tabular-nums">{branch}</span>
          </span>
          <span className="min-w-0">
            <span className="text-slate-500">口座番号：</span>
            <span className="font-medium tabular-nums">{number}</span>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-3">
          <label className="block min-w-0 flex-1 text-sm sm:max-w-[12rem]">
            <span className="text-slate-500">支店：</span>
            <input
              className={`${inputCls} mt-0.5 block`}
              value={draftB}
              onChange={(e) => setDraftB(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block min-w-0 flex-1 text-sm sm:max-w-[14rem]">
            <span className="text-slate-500">口座番号：</span>
            <input
              className={`${inputCls} mt-0.5 block`}
              value={draftN}
              onChange={(e) => setDraftN(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
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
    <div className="border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
        <label className="block min-w-0 flex-1 basis-[9rem] text-sm sm:max-w-[12rem]">
          <span className="text-slate-500">支店：</span>
          <input
            className={`${inputCls} mt-0.5 block`}
            value={draftB}
            onChange={(e) => setDraftB(e.target.value)}
            placeholder="未入力"
            autoComplete="off"
          />
        </label>
        <label className="block min-w-0 flex-1 basis-[10rem] text-sm sm:max-w-[14rem]">
          <span className="text-slate-500">口座番号：</span>
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
          className="shrink-0 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          登録
        </button>
      </div>
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
    const numericFields: (keyof Case['clientBasicInfo'])[] = [
      'age',
      'rent',
      'monthlyIncome',
      'recordNumber',
    ]
    updateCase({
      clientBasicInfo: {
        ...caseData.clientBasicInfo,
        [field]: numericFields.includes(field)
          ? value === ''
            ? null
            : Number(value)
          : value || null,
      },
    })
  }

  const updatePaymentInfo = (
    field: keyof Case['paymentInfo'],
    value: string
  ) => {
    const numericFields: (keyof Case['paymentInfo'])[] = [
      'firstPaymentAmount',
      'basePaymentAmount',
      'cumulativePaymentAmount',
    ]
    updateCase({
      paymentInfo: {
        ...caseData.paymentInfo,
        [field]: numericFields.includes(field)
          ? value === ''
            ? null
            : Number(value)
          : value || null,
      },
    })
  }

  const updateAppointmentInfo = (
    field: keyof Case['appointmentInfo'],
    value: string
  ) => {
    let next: Case['appointmentInfo'][typeof field]
    if (field === 'elapsedDays') {
      next = (value === '' ? null : Number(value)) as Case['appointmentInfo'][typeof field]
    } else if (field === 'acceptanceRank') {
      const r = value || null
      next = (r && ['A', 'B', 'C'].includes(r) ? r : null) as Case['appointmentInfo'][typeof field]
    } else if (field === 'debtAdjustmentType') {
      const t = value || null
      next = (
        t && ['任意整理', '自己破産', '個人再生'].includes(t)
          ? t
          : null
      ) as Case['appointmentInfo'][typeof field]
    } else {
      next = (value || null) as Case['appointmentInfo'][typeof field]
    }
    updateCase({
      appointmentInfo: {
        ...caseData.appointmentInfo,
        [field]: next,
      },
    })
  }

  const updateDebtInfo = (field: keyof Case['debtInfo'], value: string) => {
    const numericFields: (keyof Case['debtInfo'])[] = [
      'creditorCount',
      'declaredDebtAmount',
      'totalDebtAmount',
      'preRequestPayment',
      'postRequestPayment',
    ]
    updateCase({
      debtInfo: {
        ...caseData.debtInfo,
        [field]: numericFields.includes(field)
          ? value === ''
            ? null
            : Number(value)
          : value || null,
      },
    })
  }

  const updateSettlementInfo = (field: keyof Case['settlementInfo'], value: string) => {
    const numericFields: (keyof Case['settlementInfo'])[] = [
      'settlementCount',
      'postSettlementPaymentCount',
      'plannedPaymentCount',
      'plannedAgentCount',
    ]
    const dateFields: (keyof Case['settlementInfo'])[] = [
      'proposalDate',
      'allSettlementDocSentDate',
    ]
    updateCase({
      settlementInfo: {
        ...caseData.settlementInfo,
        [field]: numericFields.includes(field)
          ? value === ''
            ? null
            : Number(value)
          : dateFields.includes(field)
            ? value || null
            : value || null,
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
        <div className="flex w-full items-center gap-x-6 gap-y-2 border-b border-slate-100 px-6 py-2.5 text-base leading-snug text-slate-800">
          <Link
            to="/"
            className="shrink-0 text-slate-400 hover:text-slate-600"
            aria-label="一覧に戻る"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <span className="shrink-0">
              <span className="text-slate-500">ID：</span>
              <span className="font-medium">{displayCaseId}</span>
            </span>
            <span className="shrink-0">
              <span className="text-slate-500">名前：</span>
              <span className="font-medium">{caseData.clientBasicInfo.name ?? '-'}</span>
            </span>
            <span className="shrink-0">
              <span className="text-slate-500">フリガナ：</span>
              <span className="font-medium">{caseData.clientBasicInfo.furigana ?? '-'}</span>
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              <span className="text-slate-500">受任後ステータス：</span>
              <StatusBadge status={caseData.settlementInfo.status} size="md" />
            </span>
            <span className="shrink-0">
              <span className="text-slate-500">電話番号：</span>
              <span className="font-medium">{caseData.clientBasicInfo.phone ?? '-'}</span>
            </span>
            <span className="min-w-0 shrink">
              <span className="text-slate-500">メールアドレス：</span>
              <span className="font-medium break-all">{caseData.clientBasicInfo.email ?? '-'}</span>
            </span>
            <span className="shrink-0">
              <span className="text-slate-500">要注意ランク：</span>
              <span className="font-medium">{caseData.clientBasicInfo.cautionRank ?? '-'}</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {lineHref ? (
              <a
                href={lineHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md bg-[#06C755] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:opacity-90"
              >
                LINE@
              </a>
            ) : (
              <span className="text-slate-400">LINE@未設定</span>
            )}
            <LineUrlQuickEdit
              lineUrl={caseData.clientBasicInfo.lineUrl}
              onSave={(next) =>
                updateClientBasicInfo('lineUrl', next != null && next.length > 0 ? next : '')
              }
            />
          </div>
        </div>
        {/* リスト・受任・報酬・入金（全幅に均等グリッド。狭い画面は列数を段階的に減らして折返し） */}
        <div className="w-full border-b border-slate-100 px-6 py-2">
          <div className="grid w-full min-w-0 grid-cols-2 items-end gap-x-1.5 gap-y-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9">
            <div className="min-w-0">
              <EditableField
                compact
                label="リスト登録日"
                value={caseData.metadata.listRegisteredDate}
                onChange={(v) => updateMetadata('listRegisteredDate', v)}
                type="date"
              />
            </div>
            <div className="min-w-0">
              <EditableField
                compact
                label="リスト区分"
                value={caseData.metadata.listCategory}
                onChange={(v) => updateMetadata('listCategory', v)}
              />
            </div>
            <div className="min-w-0">
              <EditableField
                compact
                label="受任日"
                value={caseData.appointmentInfo.acceptanceDate}
                onChange={(v) => updateAppointmentInfo('acceptanceDate', v)}
                type="date"
              />
            </div>
            <div className="min-w-0">
              <EditableField
                compact
                label="面談担当"
                value={caseData.appointmentInfo.interviewStaff}
                onChange={(v) => updateAppointmentInfo('interviewStaff', v)}
              />
            </div>
            <div className="min-w-0">
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
            <div className="min-w-0">
              <EditableField
                compact
                label="通常報酬"
                value={caseData.feeInfo.normalFee}
                onChange={(v) => updateFeeInfo('normalFee', v)}
                type="number"
                suffix="円"
              />
            </div>
            <div className="min-w-0">
              <EditableField
                compact
                label="報酬分割回数"
                value={caseData.feeInfo.installmentCount}
                onChange={(v) => updateFeeInfo('installmentCount', v)}
                type="number"
                suffix="回"
              />
            </div>
            <div className="min-w-0">
              <EditableField
                compact
                label="毎月入金日"
                value={caseData.paymentInfo.monthlyPaymentDay}
                onChange={(v) => updatePaymentInfo('monthlyPaymentDay', v)}
              />
            </div>
            <div className="min-w-0">
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
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
          {/* Left Column - Summary */}
          <div className="lg:col-span-1 space-y-3">
            {/* ② 入金管理をメインにするため、入金状況サマリを最上部へ */}
            <SectionCard title="入金状況" color="blue">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-1">
                  <span className="shrink-0 text-sm text-slate-600">累計入金額：</span>
                  <span className="min-w-0 whitespace-normal break-words text-right text-xl font-bold text-blue-600">
                    {formatYenPair(
                      caseData.paymentInfo.cumulativePaymentAmount,
                      caseData.paymentInfo.cumulativePlannedPayment
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-sm">
                  <span className="shrink-0 text-slate-500">残入金予定額：</span>
                  <span className="min-w-0 whitespace-normal break-words text-right font-medium tabular-nums">
                    {remainingPlanned != null ? `${remainingPlanned.toLocaleString()}円` : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-sm">
                  <span className="shrink-0 text-slate-500">次回／最終入金予定日：</span>
                  <span className="min-w-0 whitespace-normal break-words text-right font-medium">
                    {formatDatePair(displayNextPaymentDate, finalPlannedDate)}
                  </span>
                </div>
                <hr className="border-slate-100" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="min-w-0 text-sm text-slate-600">
                    <span className="text-slate-600">報酬充当額：</span>
                    <span className="font-medium text-slate-900">
                      {caseData.paymentInfo.cumulativeFeeAllocation?.toLocaleString() ?? '-'}
                    </span>
                    <span className="text-slate-400">円</span>
                  </div>
                  <div className="min-w-0 text-sm text-slate-600">
                    <span className="text-slate-600">未回収額：</span>
                    <span className="font-medium text-slate-900">
                      {caseData.feeInfo.uncollectedFee?.toLocaleString() ?? '-'}
                    </span>
                    <span className="text-slate-400">円</span>
                  </div>
                  <div className="min-w-0 text-sm text-slate-600">
                    <span className="text-slate-600">弁代充当額：</span>
                    <span className="font-medium text-slate-900">
                      {sumActualAgentFee.toLocaleString()}
                    </span>
                    <span className="text-slate-400">円</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 text-sm text-slate-600">
                    <span className="text-slate-600">プール充当額：</span>
                    <span className="font-medium text-slate-900">
                      {sumActualPool.toLocaleString()}
                    </span>
                    <span className="text-slate-400">円</span>
                  </div>
                  <div className="min-w-0 text-sm text-slate-600">
                    <span className="text-slate-600">弁済充当額：</span>
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

            {/* 依頼者基本情報（ヘッダーに氏名等。こちらは住所・勤務等の詳細） */}
            <SectionCard
              title="依頼者基本情報"
              color="slate"
              collapsible
              defaultOpen={false}
            >
              <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                <div className="col-span-full min-w-0 break-all">
                  <EditableField
                    label="LINE@ URL"
                    value={caseData.clientBasicInfo.lineUrl ?? ''}
                    onChange={(v) => updateClientBasicInfo('lineUrl', v)}
                    type="textarea"
                    placeholder="https://chat.line.biz/…（未設定のときは空欄）"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="都道府県"
                    value={caseData.clientBasicInfo.prefecture}
                    onChange={(v) => updateClientBasicInfo('prefecture', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="居住形態"
                    value={caseData.clientBasicInfo.residenceType}
                    onChange={(v) => updateClientBasicInfo('residenceType', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="家賃"
                    value={caseData.clientBasicInfo.rent}
                    onChange={(v) => updateClientBasicInfo('rent', v)}
                    type="number"
                    suffix="円"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="生年月日"
                    value={caseData.clientBasicInfo.birthDate}
                    onChange={(v) => updateClientBasicInfo('birthDate', v)}
                    type="date"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="年齢"
                    value={caseData.clientBasicInfo.age}
                    onChange={(v) => updateClientBasicInfo('age', v)}
                    type="number"
                    suffix="歳"
                  />
                </div>
                <div className="min-w-0">
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
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="結婚"
                    value={caseData.clientBasicInfo.maritalStatus}
                    onChange={(v) => updateClientBasicInfo('maritalStatus', v)}
                    type="select"
                    options={[
                      { value: '既婚', label: '既婚' },
                      { value: '未婚', label: '未婚' },
                      { value: '離婚', label: '離婚' },
                    ]}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="子供"
                    value={caseData.clientBasicInfo.children}
                    onChange={(v) => updateClientBasicInfo('children', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="同居"
                    value={caseData.clientBasicInfo.cohabitation ?? ''}
                    onChange={(v) => updateClientBasicInfo('cohabitation', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="内密先"
                    value={caseData.clientBasicInfo.confidentialContact ?? ''}
                    onChange={(v) => updateClientBasicInfo('confidentialContact', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="緊急連絡先"
                    value={caseData.clientBasicInfo.emergencyContact ?? ''}
                    onChange={(v) => updateClientBasicInfo('emergencyContact', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="関係（緊急）"
                    value={caseData.clientBasicInfo.emergencyContactRelation ?? ''}
                    onChange={(v) => updateClientBasicInfo('emergencyContactRelation', v)}
                  />
                </div>
                <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-4">
                  <EditableField
                    label="住所"
                    value={caseData.clientBasicInfo.address}
                    onChange={(v) => updateClientBasicInfo('address', v)}
                  />
                </div>
                <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-4">
                  <EditableField
                    label="旧住所"
                    value={caseData.clientBasicInfo.previousAddress ?? ''}
                    onChange={(v) => updateClientBasicInfo('previousAddress', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="月収"
                    value={caseData.clientBasicInfo.monthlyIncome}
                    onChange={(v) => updateClientBasicInfo('monthlyIncome', v)}
                    type="number"
                    suffix="円"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="給与日"
                    value={caseData.clientBasicInfo.payDay}
                    onChange={(v) => updateClientBasicInfo('payDay', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="給与口座"
                    value={caseData.clientBasicInfo.payrollAccount ?? ''}
                    onChange={(v) => updateClientBasicInfo('payrollAccount', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="勤務形態"
                    value={caseData.clientBasicInfo.employmentType}
                    onChange={(v) => updateClientBasicInfo('employmentType', v)}
                  />
                </div>
                <div className="col-span-2 min-w-0 lg:col-span-2">
                  <EditableField
                    label="勤務先名"
                    value={caseData.clientBasicInfo.employerName ?? ''}
                    onChange={(v) => updateClientBasicInfo('employerName', v)}
                  />
                </div>
                <div className="col-span-2 min-w-0 lg:col-span-2">
                  <EditableField
                    label="勤務先連絡先"
                    value={caseData.clientBasicInfo.employerContact ?? ''}
                    onChange={(v) => updateClientBasicInfo('employerContact', v)}
                  />
                </div>
                <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-4">
                  <EditableField
                    label="勤務先住所"
                    value={caseData.clientBasicInfo.employerAddress ?? ''}
                    onChange={(v) => updateClientBasicInfo('employerAddress', v)}
                  />
                </div>
                <div className="col-span-2 min-w-0 lg:col-span-2">
                  <EditableField
                    label="他事務所相談"
                    value={caseData.clientBasicInfo.otherOfficeConsultation ?? ''}
                    onChange={(v) => updateClientBasicInfo('otherOfficeConsultation', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="遅れ"
                    value={caseData.clientBasicInfo.paymentDelay ?? ''}
                    onChange={(v) => updateClientBasicInfo('paymentDelay', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="自転車"
                    value={caseData.clientBasicInfo.bicycleNote ?? ''}
                    onChange={(v) => updateClientBasicInfo('bicycleNote', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="年金"
                    value={caseData.clientBasicInfo.pension ?? ''}
                    onChange={(v) => updateClientBasicInfo('pension', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="レコード番号"
                    value={caseData.clientBasicInfo.recordNumber}
                    onChange={(v) => updateClientBasicInfo('recordNumber', v)}
                    type="number"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="対応要否"
                    value={caseData.clientBasicInfo.correspondenceRequired ?? ''}
                    onChange={(v) => updateClientBasicInfo('correspondenceRequired', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="対応時間"
                    value={caseData.clientBasicInfo.correspondenceHours ?? ''}
                    onChange={(v) => updateClientBasicInfo('correspondenceHours', v)}
                  />
                </div>
              </div>
            </SectionCard>

            {/* 受任情報 */}
            <SectionCard title="受任情報" color="amber" collapsible defaultOpen={false}>
              <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                <div className="min-w-0">
                  <EditableField
                    label="アポ担当"
                    value={caseData.appointmentInfo.appointmentStaff}
                    onChange={(v) => updateAppointmentInfo('appointmentStaff', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="後確担当"
                    value={caseData.appointmentInfo.followUpStaff}
                    onChange={(v) => updateAppointmentInfo('followUpStaff', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="受任日"
                    value={caseData.appointmentInfo.acceptanceDate}
                    onChange={(v) => updateAppointmentInfo('acceptanceDate', v)}
                    type="date"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="経過日数"
                    value={caseData.appointmentInfo.elapsedDays ?? ''}
                    onChange={(v) => updateAppointmentInfo('elapsedDays', v)}
                    type="number"
                    suffix="日"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="債務整理区分"
                    value={caseData.appointmentInfo.debtAdjustmentType ?? ''}
                    onChange={(v) => updateAppointmentInfo('debtAdjustmentType', v)}
                    type="select"
                    options={[
                      { value: '任意整理', label: '任意整理' },
                      { value: '自己破産', label: '自己破産' },
                      { value: '個人再生', label: '個人再生' },
                    ]}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="C受任昇格日"
                    value={caseData.appointmentInfo.cAcceptancePromotionDate}
                    onChange={(v) => updateAppointmentInfo('cAcceptancePromotionDate', v)}
                    type="date"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="債権社数"
                    value={caseData.debtInfo.creditorCount}
                    onChange={(v) => updateDebtInfo('creditorCount', v)}
                    type="number"
                    suffix="社"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="申告債務額"
                    value={caseData.debtInfo.declaredDebtAmount}
                    onChange={(v) => updateDebtInfo('declaredDebtAmount', v)}
                    type="number"
                    suffix="円"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="予定弁済総数"
                    value={caseData.settlementInfo.plannedPaymentCount}
                    onChange={(v) => updateSettlementInfo('plannedPaymentCount', v)}
                    type="number"
                    suffix="回"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="予定弁済報酬総額"
                    value={caseData.feeInfo.plannedPaymentFeeTotal}
                    onChange={(v) => updateFeeInfo('plannedPaymentFeeTotal', v)}
                    type="number"
                    suffix="円"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="依頼 前 返済額"
                    value={caseData.debtInfo.preRequestPayment}
                    onChange={(v) => updateDebtInfo('preRequestPayment', v)}
                    type="number"
                    suffix="円"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="依頼 後 返済額"
                    value={caseData.debtInfo.postRequestPayment}
                    onChange={(v) => updateDebtInfo('postRequestPayment', v)}
                    type="number"
                    suffix="円"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="初回入金予定日"
                    value={caseData.paymentInfo.firstPaymentDate}
                    onChange={(v) => updatePaymentInfo('firstPaymentDate', v)}
                    type="date"
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="10日以内"
                    value={caseData.paymentInfo.firstPaymentWithinTenDays}
                    onChange={(v) => updatePaymentInfo('firstPaymentWithinTenDays', v)}
                  />
                </div>
                <div className="min-w-0">
                  <EditableField
                    label="初回入金額"
                    value={caseData.paymentInfo.firstPaymentAmount}
                    onChange={(v) => updatePaymentInfo('firstPaymentAmount', v)}
                    type="number"
                    suffix="円"
                  />
                </div>
                <div className="col-span-full min-w-0">
                  <EditableField
                    label="面談時備考１"
                    value={caseData.appointmentInfo.interviewMemo1}
                    onChange={(v) => updateAppointmentInfo('interviewMemo1', v)}
                    type="textarea"
                  />
                </div>
                <div className="col-span-full min-w-0">
                  <EditableField
                    label="面談時備考２"
                    value={caseData.appointmentInfo.interviewMemo2}
                    onChange={(v) => updateAppointmentInfo('interviewMemo2', v)}
                    type="textarea"
                  />
                </div>
                <div className="col-span-full min-w-0">
                  <EditableField
                    label="収支メモ"
                    value={caseData.appointmentInfo.incomeExpenseMemo}
                    onChange={(v) => updateAppointmentInfo('incomeExpenseMemo', v)}
                    type="textarea"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="受任資料" color="slate" collapsible defaultOpen={false}>
              <SettlementFiles caseId={caseData.id} />
            </SectionCard>
          </div>

          {/* Right Column - 入金スケジュール・和解状況（カード内タブで切替） */}
          <div className="min-h-0 w-full min-w-0 lg:col-span-2">
            <SectionCard title="入金スケジュール・和解状況" color="green">
              <div className="flex min-h-0 w-full min-w-0 flex-col">
              <Tabs
                tabBodyScroll="host"
                tabBodyMaxHeightClassName="h-[min(82vh,44rem)]"
                tabs={[
                  {
                    id: 'payments',
                    label: '入金スケジュール',
                    content: (
                      <Tabs
                        tabs={paymentTabs}
                        defaultTab="all"
                        activeTabId={displayCreditorScopeTabId}
                        onActiveTabChange={setCreditorScopeTabId}
                        density="dense"
                        tabBodyScroll="guest"
                      />
                    ),
                  },
                  {
                    id: 'settlement',
                    label: '和解状況',
                    content: (
                      <Tabs
                        tabs={settlementTabs}
                        defaultTab="all"
                        activeTabId={displayCreditorScopeTabId}
                        onActiveTabChange={setCreditorScopeTabId}
                        density="dense"
                        tabBodyScroll="guest"
                      />
                    ),
                  },
                ]}
                defaultTab="payments"
                variant="split"
              />
              </div>
            </SectionCard>
          </div>
        </div>

        {/* 接触履歴（下部・通常フォントで表示） */}
        <div className="mt-3 min-w-0">
          <SectionCard title="接触履歴" color="slate" collapsible defaultOpen={false}>
            <Tabs
              variant="split"
              defaultTab="client"
              tabs={[
                {
                  id: 'client',
                  label: '依頼者接触',
                  content: (
                    <ContactHistoryTable
                      caseId={caseData.id}
                      targetType="依頼者"
                      histories={contactHistories.filter((h) => h.targetType === '依頼者')}
                    />
                  ),
                },
                {
                  id: 'creditor',
                  label: '債権者接触',
                  content: (
                    <ContactHistoryTable
                      caseId={caseData.id}
                      targetType="債権者"
                      histories={contactHistories.filter((h) => h.targetType === '債権者')}
                    />
                  ),
                },
              ]}
            />
          </SectionCard>
        </div>
      </div>
      </main>
    </div>
  )
}
