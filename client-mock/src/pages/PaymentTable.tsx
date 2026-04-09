import { useState } from 'react'
import { useCaseDispatch, usePaymentsByCaseId } from '../store/useCaseStore'
import { DataTable, type Column } from '../components'
import type { PaymentRecord } from '../types'

interface PaymentTableProps {
  caseId: number
  payments: PaymentRecord[]
  /** 新規「入金予定を追加」時に付与する債権者ID。省略＝案件全体行 */
  scheduleCreditorId?: number | null
  /** 上部の入金サマリ4枠 */
  showAggregateSummary?: boolean
}

export function PaymentTable({
  caseId,
  payments,
  scheduleCreditorId,
  showAggregateSummary = true,
}: PaymentTableProps) {
  const dispatch = useCaseDispatch()
  const allCasePayments = usePaymentsByCaseId(caseId)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<Partial<PaymentRecord>>({})

  const sortedPayments = [...payments].sort((a, b) => {
    const dateA = a.plannedDate ?? ''
    const dateB = b.plannedDate ?? ''
    return dateB.localeCompare(dateA)
  })

  const handleEdit = (payment: PaymentRecord) => {
    setEditingId(payment.id)
    setEditData({
      actualDate: payment.actualDate,
      actualAmount: payment.actualAmount,
      actualFeeAllocation: payment.actualFeeAllocation,
      actualPoolAllocation: payment.actualPoolAllocation,
      actualRepaymentAllocation: payment.actualRepaymentAllocation,
    })
  }

  const handleSave = (payment: PaymentRecord) => {
    dispatch({
      type: 'UPDATE_PAYMENT',
      payload: {
        ...payment,
        ...editData,
      },
    })
    setEditingId(null)
    setEditData({})
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditData({})
  }

  const columns: Column<PaymentRecord>[] = [
    {
      key: 'creditorInstallmentIndex',
      header: '和解回',
      width: '52px',
      align: 'center',
      render: (item) =>
        item.creditorInstallmentIndex != null ? (
          <span className="text-slate-600">{item.creditorInstallmentIndex}</span>
        ) : (
          <span className="text-slate-300">-</span>
        ),
    },
    {
      key: 'plannedDate',
      header: '予定日',
      width: '100px',
      render: (item) => (
        <span className={!item.actualDate ? 'font-medium' : ''}>
          {item.plannedDate}
        </span>
      ),
    },
    {
      key: 'plannedAmount',
      header: '予定額',
      width: '100px',
      align: 'right',
      render: (item) => (
        <span>
          {item.plannedAmount?.toLocaleString()}
          <span className="text-slate-400 text-xs ml-1">円</span>
        </span>
      ),
    },
    {
      key: 'actualDate',
      header: '実入金日',
      width: '100px',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="date"
              value={editData.actualDate ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, actualDate: e.target.value || null })
              }
              className="w-full text-xs border border-blue-300 rounded px-1 py-0.5"
            />
          )
        }
        return item.actualDate ? (
          <span className="text-green-600">{item.actualDate}</span>
        ) : (
          <span className="text-slate-300">未入金</span>
        )
      },
    },
    {
      key: 'actualAmount',
      header: '実入金額',
      width: '100px',
      align: 'right',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualAmount ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualAmount: Number(e.target.value) || null,
                })
              }
              className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 text-right"
            />
          )
        }
        return item.actualAmount ? (
          <span className="text-green-600 font-medium">
            {item.actualAmount.toLocaleString()}
            <span className="text-slate-400 text-xs ml-1">円</span>
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        )
      },
    },
    {
      key: 'actualFeeAllocation',
      header: '報酬充当',
      width: '90px',
      align: 'right',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualFeeAllocation ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualFeeAllocation: Number(e.target.value) || null,
                })
              }
              className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 text-right"
            />
          )
        }
        return item.actualFeeAllocation ? (
          <span>{item.actualFeeAllocation.toLocaleString()}</span>
        ) : (
          <span className="text-slate-300">-</span>
        )
      },
    },
    {
      key: 'actualPoolAllocation',
      header: 'プール充当',
      width: '90px',
      align: 'right',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualPoolAllocation ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualPoolAllocation: Number(e.target.value) || null,
                })
              }
              className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 text-right"
            />
          )
        }
        return item.actualPoolAllocation ? (
          <span>{item.actualPoolAllocation.toLocaleString()}</span>
        ) : (
          <span className="text-slate-300">-</span>
        )
      },
    },
    {
      key: 'actualRepaymentAllocation',
      header: '弁済充当',
      width: '90px',
      align: 'right',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualRepaymentAllocation ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualRepaymentAllocation: Number(e.target.value) || null,
                })
              }
              className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 text-right"
            />
          )
        }
        return item.actualRepaymentAllocation ? (
          <span>{item.actualRepaymentAllocation.toLocaleString()}</span>
        ) : (
          <span className="text-slate-300">-</span>
        )
      },
    },
    {
      key: 'cumulativePool',
      header: '累積プール',
      width: '100px',
      align: 'right',
      render: (item) => (
        <span className="text-slate-500">
          {item.cumulativePool?.toLocaleString() ?? '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '80px',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <div className="flex gap-1">
              <button
                onClick={() => handleSave(item)}
                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                保存
              </button>
              <button
                onClick={handleCancel}
                className="px-2 py-1 text-xs bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
              >
                取消
              </button>
            </div>
          )
        }
        return (
          <button
            onClick={() => handleEdit(item)}
            className="px-2 py-1 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded"
          >
            編集
          </button>
        )
      },
    },
  ]

  // 集計
  const totalPlanned = payments.reduce((sum, p) => sum + (p.plannedAmount ?? 0), 0)
  const totalActual = payments.reduce((sum, p) => sum + (p.actualAmount ?? 0), 0)
  const paidCount = payments.filter((p) => p.actualDate).length

  return (
    <div className="space-y-4">
      {showAggregateSummary && (
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 sm:gap-4 sm:p-4">
          <div>
            <div className="text-xs text-slate-500">入金回数</div>
            <div className="text-lg font-bold">
              {paidCount}/{payments.length}
              <span className="ml-1 text-sm font-normal text-slate-400">回</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">予定額合計</div>
            <div className="text-lg font-bold">{totalPlanned.toLocaleString()}円</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">実入金額合計</div>
            <div className="text-lg font-bold text-green-600">
              {totalActual.toLocaleString()}円
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">差額</div>
            <div
              className={`text-lg font-bold ${totalActual - totalPlanned >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {(totalActual - totalPlanned).toLocaleString()}円
            </div>
          </div>
        </div>
      )}

      {/* テーブル */}
      <DataTable
        data={sortedPayments}
        columns={columns}
        keyField="id"
        emptyMessage="入金データがありません"
      />

      {/* 新規追加ボタン */}
      <button
        onClick={() => {
          const newId =
            Math.max(0, ...allCasePayments.map((p) => p.id)) + 1
          const lastPayment = sortedPayments[0]
          const scopeCreditorId =
            scheduleCreditorId === undefined ? null : scheduleCreditorId
          const prevInstallmentMax = payments.reduce(
            (m, p) => Math.max(m, p.creditorInstallmentIndex ?? 0),
            0
          )
          const creditorInstallmentIndex =
            scopeCreditorId != null ? prevInstallmentMax + 1 : null
          dispatch({
            type: 'ADD_PAYMENT',
            payload: {
              id: newId,
              caseId,
              creditorId: scopeCreditorId,
              creditorInstallmentIndex,
              plannedDate: null,
              plannedAmount: lastPayment?.plannedAmount ?? null,
              plannedFeeAllocation: lastPayment?.plannedFeeAllocation ?? null,
              plannedAgentFeeAllocation: lastPayment?.plannedAgentFeeAllocation ?? null,
              plannedPoolAllocation: lastPayment?.plannedPoolAllocation ?? null,
              plannedRepaymentAllocation: lastPayment?.plannedRepaymentAllocation ?? null,
              actualDate: null,
              actualAmount: null,
              actualFeeAllocation: null,
              actualAgentFeeAllocation: null,
              actualPoolAllocation: null,
              actualRepaymentAllocation: null,
              handlingFee: null,
              repaymentCount: null,
              cumulativePool: null,
            },
          })
        }}
        className="w-full py-2 text-sm text-blue-500 border border-dashed border-blue-300 rounded hover:bg-blue-50 transition-colors"
      >
        + 入金予定を追加
      </button>
    </div>
  )
}
