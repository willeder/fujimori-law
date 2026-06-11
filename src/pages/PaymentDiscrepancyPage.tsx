import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '../components'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'

type SortKey = 'date' | 'difference' | 'amount'

interface DiscrepancyRow {
  paymentId: number
  caseId: number
  externalId: string | null
  caseName: string
  plannedDate: string | null
  plannedAmount: number
  actualDate: string | null
  actualAmount: number
  difference: number
  isLess: boolean
}

/** /api/payments/discrepancies の応答行（サーバ集計済み） */
interface ServerDiscrepancy {
  id: number
  caseId: number
  externalId: string | null
  caseName: string | null
  plannedDate: string | null
  plannedAmount: number
  actualDate: string | null
  actualAmount: number
}

export function PaymentDiscrepancyPage() {
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState<SortKey>('difference')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'less' | 'more'>('all')
  // 差異行はサーバ集計から取得（全 payments のロードを回避）
  const [data, setData] = useState<ServerDiscrepancy[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/payments/discrepancies')
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ServerDiscrepancy[]) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setData([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    const discrepancies: DiscrepancyRow[] = (data ?? [])
      .map((d) => ({
        paymentId: d.id,
        caseId: d.caseId,
        externalId: d.externalId,
        caseName: d.caseName ?? '-',
        plannedDate: d.plannedDate,
        plannedAmount: d.plannedAmount,
        actualDate: d.actualDate,
        actualAmount: d.actualAmount,
        difference: d.actualAmount - d.plannedAmount,
        isLess: d.actualAmount < d.plannedAmount,
      }))
      .filter((r) => {
        if (statusFilter === 'less' && !r.isLess) return false
        if (statusFilter === 'more' && r.isLess) return false
        if (
          query &&
          !(
            r.caseName.toLowerCase().includes(query) ||
            r.externalId?.toLowerCase().includes(query)
          )
        )
          return false
        return true
      })

    // ソート
    return discrepancies.sort((a, b) => {
      switch (sortKey) {
        case 'difference':
          // 差額の絶対値で降順（大きい相違順）
          return Math.abs(b.difference) - Math.abs(a.difference)
        case 'amount':
          // 予定額で降順
          return b.plannedAmount - a.plannedAmount
        case 'date':
        default:
          // 実入金日の降順
          return (b.actualDate ?? '').localeCompare(a.actualDate ?? '')
      }
    })
  }, [data, sortKey, q, statusFilter])

  const columns: Column<DiscrepancyRow>[] = [
    {
      key: 'caseId',
      header: 'ID',
      width: '76px',
      align: 'center',
      render: (r) => r.externalId ?? '-',
    },
    {
      key: 'caseName',
      header: '依頼者名',
      width: '120px',
    },
    {
      key: 'plannedDate',
      header: '予定日',
      width: '100px',
      render: (r) => r.plannedDate ?? '-',
    },
    {
      key: 'plannedAmount',
      header: '予定額',
      width: '100px',
      align: 'right',
      render: (r) => `${r.plannedAmount.toLocaleString()}円`,
    },
    {
      key: 'actualDate',
      header: '実入金日',
      width: '100px',
      render: (r) => r.actualDate ?? '-',
    },
    {
      key: 'actualAmount',
      header: '実入金額',
      width: '100px',
      align: 'right',
      render: (r) => (
        <span className={r.isLess ? 'text-red-600 font-medium' : 'text-blue-600 font-medium'}>
          {r.actualAmount.toLocaleString()}円
        </span>
      ),
    },
    {
      key: 'difference',
      header: '差額',
      width: '100px',
      align: 'right',
      render: (r) => (
        <span className={r.isLess ? 'text-red-600 font-medium' : 'text-blue-600 font-medium'}>
          {r.difference > 0 ? '+' : ''}{r.difference.toLocaleString()}円
        </span>
      ),
    },
    {
      key: 'status',
      header: '状態',
      width: '80px',
      align: 'center',
      render: (r) => (
        <span className={`px-2 py-0.5 rounded text-xs ${
          r.isLess
            ? 'bg-red-100 text-red-700'
            : 'bg-blue-100 text-blue-700'
        }`}>
          {r.isLess ? '不足' : '超過'}
        </span>
      ),
    },
  ]

  // 総数は全データから（フィルターに左右されない）
  const lessCount = (data ?? []).filter((d) => d.actualAmount < d.plannedAmount).length
  const moreCount = (data ?? []).filter((d) => d.actualAmount > d.plannedAmount).length

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="入金額相違一覧">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="依頼者名・IDで検索"
            className="w-52 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="flex items-center gap-1.5">
            <span className="text-slate-600">状態:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'less' | 'more')}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs"
            >
              <option value="all">すべて</option>
              <option value="less">不足</option>
              <option value="more">超過</option>
            </select>
          </label>
          <span className="text-slate-300">|</span>
          <span>{data === null ? '読み込み中…' : `${rows.length}件`}</span>
          <span className="text-red-600">不足: {lessCount}件</span>
          <span className="text-blue-600">超過: {moreCount}件</span>
          <span className="text-slate-300">|</span>
          <label className="flex items-center gap-1.5">
            <span className="text-slate-600">並び順:</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="border border-slate-300 rounded px-2 py-0.5 text-xs bg-white"
            >
              <option value="difference">差額（大きい順）</option>
              <option value="date">実入金日（新しい順）</option>
              <option value="amount">予定額（大きい順）</option>
            </select>
          </label>
        </div>
      </AppHeader>

      <div className="p-3">
        {data === null ? (
          <PageLoading message="入金差異を読み込み中…" />
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <DataTable
              data={rows}
              columns={columns}
              keyField="paymentId"
              onRowClick={(item) => navigate(`/cases/${item.caseId}`)}
              density="compact"
              paginated
              emptyMessage="入金額の相違はありません"
              getRowClassName={(item) => item.isLess ? 'bg-red-50' : 'bg-blue-50'}
            />
          </div>
        )}
      </div>
    </div>
  )
}
