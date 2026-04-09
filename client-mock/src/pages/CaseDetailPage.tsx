import { useMemo, useState } from 'react'
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

  const updateSettlementInfo = (
    field: keyof Case['settlementInfo'],
    value: string
  ) => {
    updateCase({
      settlementInfo: {
        ...caseData.settlementInfo,
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

  const sumActualFee = caseLevelPayments.reduce(
    (s, p) => s + (p.actualFeeAllocation ?? 0),
    0
  )
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

  return (
    <div className="min-h-screen bg-slate-200">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-2">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-slate-400 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 gap-y-1">
              <h1 className="text-lg font-bold leading-tight text-slate-800">
                {caseData.clientBasicInfo.name}
              </h1>
              <StatusBadge status={caseData.settlementInfo.status} size="md" />
              <StatusBadge status={caseData.appointmentInfo.acceptanceRank} size="md" />
            </div>
            {/* ① 上部に基本情報を追加表示（編集可能・コンパクト1行） */}
            <div className="mt-2 grid grid-cols-1 gap-x-2 gap-y-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <EditableField
                compact
                label="フリガナ"
                value={caseData.clientBasicInfo.furigana}
                onChange={(v) => updateClientBasicInfo('furigana', v)}
              />
              <EditableField
                compact
                label="受任後ステータス"
                value={caseData.settlementInfo.status}
                onChange={(v) => updateSettlementInfo('status', v)}
              />
              <EditableField
                compact
                label="ID"
                value={caseData.metadata.externalId}
                onChange={(v) => updateMetadata('externalId', v)}
              />
              <EditableField
                compact
                label="要注意ランク"
                value={caseData.clientBasicInfo.cautionRank}
                onChange={(v) => updateClientBasicInfo('cautionRank', v)}
                type="select"
                options={[
                  { value: 'A', label: 'A' },
                  { value: 'B', label: 'B' },
                  { value: 'C', label: 'C' },
                ]}
              />
              <EditableField
                compact
                label="リスト区分"
                value={caseData.metadata.listCategory}
                onChange={(v) => updateMetadata('listCategory', v)}
              />
              <EditableField
                compact
                label="リスト登録日"
                value={caseData.metadata.listRegisteredDate}
                onChange={(v) => updateMetadata('listRegisteredDate', v)}
                type="date"
              />
              <EditableField
                compact
                label="電話番号"
                value={caseData.clientBasicInfo.phone}
                onChange={(v) => updateClientBasicInfo('phone', v)}
              />
              <EditableField
                compact
                label="LINE@ URL"
                value={caseData.clientBasicInfo.lineUrl}
                onChange={(v) => updateClientBasicInfo('lineUrl', v)}
              />
              <EditableField
                compact
                label="受任日"
                value={caseData.appointmentInfo.acceptanceDate}
                onChange={(v) => updateAppointmentInfo('acceptanceDate', v)}
                type="date"
              />
              <EditableField
                compact
                label="面談担当"
                value={caseData.appointmentInfo.interviewStaff}
                onChange={(v) => updateAppointmentInfo('interviewStaff', v)}
              />
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
              <EditableField
                compact
                label="通常報酬"
                value={caseData.feeInfo.normalFee}
                onChange={(v) => updateFeeInfo('normalFee', v)}
                type="number"
                suffix="円"
              />
              <EditableField
                compact
                label="報酬分割回数"
                value={caseData.feeInfo.installmentCount}
                onChange={(v) => updateFeeInfo('installmentCount', v)}
                type="number"
                suffix="回"
              />
              <EditableField
                compact
                label="毎月入金日"
                value={caseData.paymentInfo.monthlyPaymentDay}
                onChange={(v) => updatePaymentInfo('monthlyPaymentDay', v)}
              />
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

      {/* Content */}
      <div className="p-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Left Column - Summary */}
          <div className="lg:col-span-1 space-y-3">
            {/* ② 入金管理をメインにするため、入金状況サマリを最上部へ */}
            <SectionCard title="入金状況" color="blue">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">累計入金額</span>
                  <span className="text-xl font-bold text-blue-600">
                    {caseData.paymentInfo.cumulativePaymentAmount?.toLocaleString()}
                    <span className="text-sm font-normal text-slate-400 ml-1">円</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">予定額</span>
                  <span>
                    {caseData.paymentInfo.cumulativePlannedPayment?.toLocaleString()}円
                  </span>
                </div>
                {/* ③ 追加サマリ */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">残入金予定額（予定-入金済）</span>
                  <span className="font-medium">
                    {remainingPlanned != null ? remainingPlanned.toLocaleString() : '-'}円
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">最終入金予定日</span>
                  <span className="font-medium">{finalPlannedDate ?? '-'}</span>
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
                  <div className="text-sm text-slate-600">
                    弁済充当額{' '}
                    <span className="font-medium text-slate-900">
                      {sumActualRepayment.toLocaleString()}
                    </span>
                    <span className="text-slate-400 ml-1">円</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    （参考）報酬充当（実績合計）{' '}
                    <span className="font-medium text-slate-900">
                      {sumActualFee.toLocaleString()}
                    </span>
                    <span className="text-slate-400 ml-1">円</span>
                  </div>
                </div>
                <hr className="border-slate-100" />
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
    </div>
  )
}
