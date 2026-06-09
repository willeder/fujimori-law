/**
 * 債権者リスト（合算ビュー）コンポーネント
 */
import { DataTable, type Column, StatusBadge } from '../index'
import type { Creditor } from '../../types'

interface CreditorListProps {
  creditors: Creditor[]
  onSelect?: (creditor: Creditor) => void
}

export function CreditorList({ creditors, onSelect }: CreditorListProps) {
  // 合計値を計算
  const totalDeclared = creditors.reduce((sum, c) => sum + (c.declaredAmount ?? 0), 0)
  const totalDebt = creditors.reduce((sum, c) => sum + (c.debtAmount ?? 0), 0)
  const totalSettlement = creditors.reduce((sum, c) => sum + (c.settlementAmount ?? 0), 0)

  const columns: Column<Creditor>[] = [
    {
      key: 'creditorName',
      header: '債権者',
      width: '120px',
    },
    {
      key: 'status',
      header: 'ステータス',
      width: '120px',
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: 'declaredAmount',
      header: '申告額',
      width: '100px',
      align: 'right',
      render: (item) => (
        <span>
          {item.declaredAmount?.toLocaleString()}
          <span className="text-slate-400 text-xs ml-1">円</span>
        </span>
      ),
    },
    {
      key: 'debtAmount',
      header: '債務額',
      width: '100px',
      align: 'right',
      render: (item) => (
        <span>
          {item.debtAmount?.toLocaleString()}
          <span className="text-slate-400 text-xs ml-1">円</span>
        </span>
      ),
    },
    {
      key: 'settlementAmount',
      header: '和解金額',
      width: '100px',
      align: 'right',
      render: (item) =>
        item.settlementAmount ? (
          <span className="text-green-600 font-medium">
            {item.settlementAmount.toLocaleString()}
            <span className="text-slate-400 text-xs ml-1">円</span>
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        ),
    },
    {
      key: 'paymentCount',
      header: '支払回数',
      width: '80px',
      align: 'right',
      render: (item) =>
        item.paymentCount ? (
          <span>
            {item.paymentCount}
            <span className="text-slate-400 text-xs ml-1">回</span>
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        ),
    },
    {
      key: 'settlementDate',
      header: '和解日',
      width: '100px',
      render: (item) => item.settlementDate ?? '-',
    },
  ]

  return (
    <div className="space-y-4">
      {/* 合計サマリ */}
      <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg">
        <div>
          <div className="text-xs text-slate-500">債権者数</div>
          <div className="text-lg font-bold">{creditors.length}社</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">申告債務額合計</div>
          <div className="text-lg font-bold">{totalDeclared.toLocaleString()}円</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">債務額合計</div>
          <div className="text-lg font-bold">{totalDebt.toLocaleString()}円</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">和解金額合計</div>
          <div className="text-lg font-bold text-green-600">
            {totalSettlement.toLocaleString()}円
          </div>
        </div>
      </div>

      {/* テーブル */}
      <DataTable
        data={creditors}
        columns={columns}
        keyField="id"
        onRowClick={onSelect}
        emptyMessage="債権者データがありません"
      />
    </div>
  )
}
