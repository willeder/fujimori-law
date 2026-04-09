import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '../components'
import { useCaseState } from '../store/useCaseStore'
import type { Creditor } from '../types'

type Row = {
  caseId: number
  name: string | null
  furigana: string | null
  caseStatus: string | null
  acceptanceDate: string | null
} & Creditor

export function SettlementResultsPage() {
  const navigate = useNavigate()
  const { cases, creditors } = useCaseState()
  const [creditorQuery, setCreditorQuery] = useState('')

  const rows = useMemo<Row[]>(() => {
    return creditors.map((cr) => {
      const c = cases.find((x) => x.id === cr.caseId)
      return {
        ...cr,
        caseId: cr.caseId,
        name: c?.clientBasicInfo.name ?? null,
        furigana: c?.clientBasicInfo.furigana ?? null,
        caseStatus: c?.settlementInfo.status ?? null,
        acceptanceDate: c?.appointmentInfo.acceptanceDate ?? null,
      }
    })
  }, [cases, creditors])

  const filtered = useMemo(() => {
    const q = creditorQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.creditorName.toLowerCase().includes(q))
  }, [rows, creditorQuery])

  const columns: Column<Row>[] = [
    { key: 'caseId', header: 'ID', width: '60px', align: 'center' },
    {
      key: 'name',
      header: '名前',
      width: '120px',
      render: (r) => r.name ?? '-',
    },
    {
      key: 'furigana',
      header: 'フリガナ',
      width: '140px',
      render: (r) => r.furigana ?? '-',
    },
    {
      key: 'caseStatus',
      header: '受任後ステータス',
      width: '140px',
      render: (r) => r.caseStatus ?? '-',
    },
    {
      key: 'acceptanceDate',
      header: '受任日',
      width: '100px',
      render: (r) => r.acceptanceDate ?? '-',
    },
    { key: 'creditorName', header: '債権者', width: '140px' },
    {
      key: 'acceptanceNoticeSentDate',
      header: '受任通知送付日',
      width: '110px',
      render: (r) => r.acceptanceNoticeSentDate ?? '-',
    },
    {
      key: 'debtAmount',
      header: '債務額',
      width: '110px',
      align: 'right',
      render: (r) => (r.debtAmount != null ? `${r.debtAmount.toLocaleString()}円` : '-'),
    },
    {
      key: 'responseStatus',
      header: '回答状況',
      width: '110px',
      render: (r) => r.responseStatus ?? '-',
    },
    {
      key: 'settlementDate',
      header: '和解日',
      width: '100px',
      render: (r) => r.settlementDate ?? '-',
    },
    {
      key: 'settlementAmount',
      header: '和解',
      width: '110px',
      align: 'right',
      render: (r) =>
        r.settlementAmount != null ? `${r.settlementAmount.toLocaleString()}円` : '-',
    },
    {
      key: 'settlementDebtAmount',
      header: '和解時債務金額',
      width: '130px',
      align: 'right',
      render: (r) =>
        r.settlementDebtAmount != null
          ? `${r.settlementDebtAmount.toLocaleString()}円`
          : '-',
    },
    {
      key: 'settlementContentComment',
      header: '和解内容コメント',
      width: '220px',
      render: (r) => r.settlementContentComment ?? '-',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-200">
      <header className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-800">和解実績一覧</h1>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            案件一覧へ
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="search"
            value={creditorQuery}
            onChange={(e) => setCreditorQuery(e.target.value)}
            placeholder="債権者で検索（例：楽天）"
            className="w-full max-w-md text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="text-sm text-slate-500">{filtered.length}件</div>
        </div>
      </header>

      <div className="p-3">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <DataTable
            data={filtered}
            columns={columns}
            keyField="id"
            onRowClick={(item) => navigate(`/cases/${item.caseId}`)}
            emptyMessage="該当する和解実績がありません"
          />
        </div>
      </div>
    </div>
  )
}

