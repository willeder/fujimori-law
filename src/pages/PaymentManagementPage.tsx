import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column, StatusBadge } from '../components'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'
import { useCaseState } from '../store/useCaseStore'
import type { Case } from '../types'

function compareDateAsc(a: string | null | undefined, b: string | null | undefined) {
  const aa = a ?? '9999-12-31'
  const bb = b ?? '9999-12-31'
  return aa.localeCompare(bb)
}

export function PaymentManagementPage() {
  const navigate = useNavigate()
  const { cases } = useCaseState()
  const [onlyUnpaid, setOnlyUnpaid] = useState(true)
  // 未入金案件IDはサーバ集計から取得（全 payments のロードを回避）
  const [unpaidIds, setUnpaidIds] = useState<Set<number> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/payments/unpaid-case-ids')
      .then((r) => (r.ok ? r.json() : { caseIds: [] }))
      .then((d: { caseIds: number[] }) => {
        if (!cancelled) setUnpaidIds(new Set(d.caseIds))
      })
      .catch(() => {
        if (!cancelled) setUnpaidIds(new Set())
      })
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => {
    const filtered = onlyUnpaid
      ? cases.filter((c) => unpaidIds?.has(c.id) ?? false)
      : cases
    return [...filtered].sort((a, b) =>
      compareDateAsc(a.paymentInfo.nextPaymentDate, b.paymentInfo.nextPaymentDate)
    )
  }, [cases, onlyUnpaid, unpaidIds])

  const columns: Column<Case>[] = [
    { key: 'nextPaymentDate', header: '次回入金日', width: '100px', render: (c) => c.paymentInfo.nextPaymentDate ?? '-' },
    { key: 'payDay', header: '給与日', width: '80px', render: (c) => c.clientBasicInfo.payDay ?? '-' },
    {
      key: 'uncollectedFee',
      header: '報酬未回収額',
      width: '110px',
      align: 'right',
      render: (c) => (c.feeInfo.uncollectedFee != null ? `${c.feeInfo.uncollectedFee.toLocaleString()}円` : '-'),
    },
    { key: 'id', header: 'ID', width: '60px', align: 'center' },
    {
      key: 'name',
      header: '名前',
      width: '120px',
      render: (c) => c.clientBasicInfo.name ?? '-',
    },
    {
      key: 'furigana',
      header: 'フリガナ',
      width: '140px',
      render: (c) => c.clientBasicInfo.furigana ?? '-',
    },
    {
      key: 'status',
      header: '受任後ステータス',
      width: '140px',
      render: (c) => <StatusBadge status={c.settlementInfo.status} />,
    },
    { key: 'acceptanceDate', header: '受任日', width: '100px', render: (c) => c.appointmentInfo.acceptanceDate ?? '-' },
    {
      key: 'acceptanceRank',
      header: '受任ランク',
      width: '80px',
      align: 'center',
      render: (c) => <StatusBadge status={c.appointmentInfo.acceptanceRank} />,
    },
    {
      key: 'cautionRank',
      header: '要注意ランク',
      width: '90px',
      align: 'center',
      render: (c) => c.clientBasicInfo.cautionRank ?? '-',
    },
    { key: 'appointmentStaff', header: 'アポ担当', width: '100px', render: (c) => c.appointmentInfo.appointmentStaff ?? '-' },
    { key: 'interviewStaff', header: '面談担当', width: '100px', render: (c) => c.appointmentInfo.interviewStaff ?? '-' },
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="入金管理一覧">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={onlyUnpaid}
              onChange={(e) => setOnlyUnpaid(e.target.checked)}
            />
            未入金のみ（次回入金日 昇順）
          </label>
          <div className="text-sm text-slate-500">
            {onlyUnpaid && unpaidIds === null ? '読み込み中…' : `${rows.length}件`}
          </div>
        </div>
      </AppHeader>

      <div className="p-3">
        {unpaidIds === null ? (
          <PageLoading message="入金状況を読み込み中…" />
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <DataTable
              data={rows}
              columns={columns}
              keyField="id"
              onRowClick={(item) => navigate(`/cases/${item.id}`)}
              density="compact"
              paginated
              emptyMessage="該当する案件がありません"
            />
          </div>
        )}
      </div>
    </div>
  )
}

