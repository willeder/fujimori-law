import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column, UiFontScaleControl } from '../components'
import { useCaseState } from '../store/useCaseStore'
import type { PaymentRecord, Case } from '../types'

type SortKey = 'date' | 'difference' | 'amount'

interface DiscrepancyRow {
  paymentId: number
  caseId: number
  caseName: string
  plannedDate: string | null
  plannedAmount: number
  actualDate: string | null
  actualAmount: number
  difference: number
  isLess: boolean
}

export function PaymentDiscrepancyPage() {
  const navigate = useNavigate()
  const { cases, paymentRecords } = useCaseState()
  const [sortKey, setSortKey] = useState<SortKey>('difference')

  const rows = useMemo(() => {
    const caseMap = new Map<number, Case>()
    cases.forEach((c) => caseMap.set(c.id, c))

    const discrepancies: DiscrepancyRow[] = []

    paymentRecords.forEach((p: PaymentRecord) => {
      // 実入金日がある（入金済み）かつ、金額が異なる場合
      if (p.actualDate && p.plannedDate) {
        const planned = p.plannedAmount ?? 0
        const actual = p.actualAmount ?? 0
        if (planned !== actual) {
          const caseData = caseMap.get(p.caseId)
          discrepancies.push({
            paymentId: p.id,
            caseId: p.caseId,
            caseName: caseData?.clientBasicInfo.name ?? '-',
            plannedDate: p.plannedDate,
            plannedAmount: planned,
            actualDate: p.actualDate,
            actualAmount: actual,
            difference: actual - planned,
            isLess: actual < planned,
          })
        }
      }
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
  }, [cases, paymentRecords, sortKey])

  const columns: Column<DiscrepancyRow>[] = [
    {
      key: 'actualDate',
      header: '実入金日',
      width: '100px',
      render: (r) => r.actualDate ?? '-',
    },
    {
      key: 'caseName',
      header: '依頼者名',
      width: '120px',
    },
    {
      key: 'caseId',
      header: 'ID',
      width: '60px',
      align: 'center',
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

  const lessCount = rows.filter((r) => r.isLess).length
  const moreCount = rows.filter((r) => !r.isLess).length

  return (
    <div className="min-h-screen bg-slate-200">
      <header className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-800">入金額相違一覧</h1>
          <div className="flex items-center gap-3">
            <UiFontScaleControl variant="select" />
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              案件一覧へ
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm text-slate-500">
          <span>
            全{rows.length}件
          </span>
          <span className="text-red-600">
            不足: {lessCount}件
          </span>
          <span className="text-blue-600">
            超過: {moreCount}件
          </span>
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
      </header>

      <div className="p-3">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <DataTable
            data={rows}
            columns={columns}
            keyField="paymentId"
            onRowClick={(item) => navigate(`/cases/${item.caseId}`)}
            emptyMessage="入金額の相違はありません"
            getRowClassName={(item) => item.isLess ? 'bg-red-50' : 'bg-blue-50'}
          />
        </div>
      </div>
    </div>
  )
}
