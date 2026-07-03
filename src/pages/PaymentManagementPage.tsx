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
  const [q, setQ] = useState('')
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
    const query = q.trim().toLowerCase()
    const base = onlyUnpaid
      ? cases.filter((c) => unpaidIds?.has(c.id) ?? false)
      : cases
    const filtered = !query
      ? base
      : base.filter((c) =>
          [
            c.metadata.externalId,
            c.clientBasicInfo.name,
            c.clientBasicInfo.furigana,
            c.settlementInfo.status,
            c.appointmentInfo.appointmentStaff,
            c.appointmentInfo.interviewStaff,
          ].some((f) => f?.toLowerCase().includes(query))
        )
    return [...filtered].sort((a, b) =>
      compareDateAsc(a.paymentInfo.nextPaymentDate, b.paymentInfo.nextPaymentDate)
    )
  }, [cases, onlyUnpaid, unpaidIds, q])

  const columns: Column<Case>[] = [
    { key: 'id', header: 'ID', width: '76px', align: 'center', render: (c) => c.metadata.externalId ?? '-' },
    {
      key: 'name',
      header: '名前',
      width: '120px',
      render: (c) => <span className="whitespace-nowrap">{c.clientBasicInfo.name ?? '-'}</span>,
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
    { key: 'nextPaymentDate', header: '次回入金日', width: '100px', render: (c) => c.paymentInfo.nextPaymentDate ?? '-' },
    { key: 'payDay', header: '給与日', width: '80px', render: (c) => c.clientBasicInfo.payDay ?? '-' },
    {
      key: 'uncollectedFee',
      header: '報酬未回収額',
      width: '110px',
      align: 'right',
      render: (c) => (c.feeInfo.uncollectedFee != null ? `${c.feeInfo.uncollectedFee.toLocaleString()}円` : '-'),
    },
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
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="名前・フリガナ・ID・ステータス・担当で検索"
            className="w-72 rounded border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {q && (
            <button onClick={() => setQ('')} className="text-xs text-slate-500 hover:text-slate-700">
              クリア
            </button>
          )}
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
              enableFind
              persistKey="paymentManagement"
              emptyMessage="該当する案件がありません"
            />
          </div>
        )}
      </div>
    </div>
  )
}

