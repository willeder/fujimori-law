import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column, StatusBadge } from '../components'
import { useCaseState } from '../store/useCaseStore'
import type { Case } from '../types'

function compareDateAsc(a: string | null | undefined, b: string | null | undefined) {
  const aa = a ?? '9999-12-31'
  const bb = b ?? '9999-12-31'
  return aa.localeCompare(bb)
}

export function PaymentManagementPage() {
  const navigate = useNavigate()
  const { cases, paymentRecords } = useCaseState()
  const [onlyUnpaid, setOnlyUnpaid] = useState(true)

  const rows = useMemo(() => {
    const isUnpaid = (c: Case) => {
      const next = c.paymentInfo.nextPaymentDate
      if (!next) return false
      const rec = paymentRecords.find(
        (p) =>
          p.caseId === c.id &&
          p.plannedDate === next &&
          p.creditorId == null
      )
      return !rec?.actualDate
    }

    const filtered = onlyUnpaid ? cases.filter(isUnpaid) : cases
    return [...filtered].sort((a, b) =>
      compareDateAsc(a.paymentInfo.nextPaymentDate, b.paymentInfo.nextPaymentDate)
    )
  }, [cases, onlyUnpaid, paymentRecords])

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
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-800">入金管理一覧</h1>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            案件一覧へ
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={onlyUnpaid}
              onChange={(e) => setOnlyUnpaid(e.target.checked)}
            />
            未入金のみ（次回入金日 昇順）
          </label>
          <div className="text-sm text-slate-500">{rows.length}件</div>
        </div>
      </header>

      <div className="p-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <DataTable
            data={rows}
            columns={columns}
            keyField="id"
            onRowClick={(item) => navigate(`/cases/${item.id}`)}
            emptyMessage="該当する案件がありません"
          />
        </div>
      </div>
    </div>
  )
}

