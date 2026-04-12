import { useState } from 'react'
import { useCaseDispatch, usePaymentsByCaseId } from '../store/useCaseStore'
import { DataTable, type Column } from '../components'
import type { PaymentRecord } from '../types'

interface PaymentTableProps {
  caseId: number
  payments: PaymentRecord[]
  /** 新規「入金予定を追加」時に付与する債権者ID。省略＝案件全体行 */
  scheduleCreditorId?: number | null
}

function fmtNum(n: number | null | undefined) {
  if (n == null) return <span className="text-slate-300">-</span>
  return <span>{n.toLocaleString()}</span>
}

export function PaymentTable({
  caseId,
  payments,
  scheduleCreditorId,
}: PaymentTableProps) {
  const dispatch = useCaseDispatch()
  const allCasePayments = usePaymentsByCaseId(caseId)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<Partial<PaymentRecord>>({})

  const sortedPayments = [...payments].sort((a, b) => {
    const dateA = a.plannedDate ?? ''
    const dateB = b.plannedDate ?? ''
    if (!dateA && !dateB) return 0
    if (!dateA) return 1
    if (!dateB) return -1
    return dateA.localeCompare(dateB)
  })

  const handleEdit = (payment: PaymentRecord) => {
    setEditingId(payment.id)
    setEditData({
      actualDate: payment.actualDate,
      actualAmount: payment.actualAmount,
      actualFeeAllocation: payment.actualFeeAllocation,
      actualAgentFeeAllocation: payment.actualAgentFeeAllocation,
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

  const inputCls =
    'w-full min-w-[4.5rem] rounded border border-blue-300 px-0.5 py-0.5 text-[10px] leading-tight'

  const columns: Column<PaymentRecord>[] = [
    {
      key: '__rowIndex',
      header: '',
      width: '22px',
      align: 'center',
      sortable: false,
      render: (_item, index) => (
        <span className="text-slate-500 tabular-nums">{index + 1}</span>
      ),
    },
    {
      key: 'plannedDate',
      header: '予定入金日',
      width: '76px',
      render: (item) => (
        <span className={!item.actualDate ? 'font-medium text-slate-800' : ''}>
          {item.plannedDate ?? <span className="text-slate-300">-</span>}
        </span>
      ),
    },
    {
      key: 'plannedAmount',
      header: '予定入金額',
      width: '72px',
      align: 'right',
      render: (item) => fmtNum(item.plannedAmount),
    },
    {
      key: 'plannedFeeAllocation',
      header: '予定報酬額',
      width: '68px',
      align: 'right',
      render: (item) => fmtNum(item.plannedFeeAllocation),
    },
    {
      key: 'plannedAgentFeeAllocation',
      header: '予定弁代報酬額',
      width: '76px',
      align: 'right',
      render: (item) => fmtNum(item.plannedAgentFeeAllocation),
    },
    {
      key: 'plannedPoolAllocation',
      header: '予定ﾌﾟｰﾙ額',
      width: '64px',
      align: 'right',
      render: (item) => fmtNum(item.plannedPoolAllocation),
    },
    {
      key: 'repaymentCount',
      header: '予定社数',
      width: '44px',
      align: 'right',
      render: (item) => fmtNum(item.repaymentCount),
    },
    {
      key: 'handlingFee',
      header: '予定手数料',
      width: '56px',
      align: 'right',
      render: (item) => fmtNum(item.handlingFee),
    },
    {
      key: 'plannedRepaymentAllocation',
      header: '予定弁済額',
      width: '64px',
      align: 'right',
      render: (item) => fmtNum(item.plannedRepaymentAllocation),
    },
    {
      key: 'actualDate',
      header: '実入金日',
      width: '76px',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="date"
              value={editData.actualDate ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, actualDate: e.target.value || null })
              }
              className={inputCls}
            />
          )
        }
        return item.actualDate ? (
          <span className="text-green-700">{item.actualDate}</span>
        ) : (
          <span className="text-slate-300">未</span>
        )
      },
    },
    {
      key: 'actualAmount',
      header: '実入金額',
      width: '68px',
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
              className={`${inputCls} text-right`}
            />
          )
        }
        return item.actualAmount != null ? (
          <span className="font-medium text-green-700">
            {item.actualAmount.toLocaleString()}
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        )
      },
    },
    {
      key: 'actualFeeAllocation',
      header: '報酬充当額',
      width: '64px',
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
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.actualFeeAllocation)
      },
    },
    {
      key: 'actualAgentFeeAllocation',
      header: '弁代報酬充当額',
      width: '76px',
      align: 'right',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualAgentFeeAllocation ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualAgentFeeAllocation: Number(e.target.value) || null,
                })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.actualAgentFeeAllocation)
      },
    },
    {
      key: 'actualPoolAllocation',
      header: 'ﾌﾟｰﾙ充当額',
      width: '60px',
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
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.actualPoolAllocation)
      },
    },
    {
      key: 'repaymentCountActual',
      header: '社数',
      width: '36px',
      align: 'right',
      sortable: false,
      render: (item) =>
        item.actualDate ? fmtNum(item.repaymentCount) : <span className="text-slate-300">-</span>,
    },
    {
      key: 'handlingFeeActual',
      header: '手数料',
      width: '48px',
      align: 'right',
      sortable: false,
      render: (item) =>
        item.actualDate ? fmtNum(item.handlingFee) : <span className="text-slate-300">-</span>,
    },
    {
      key: 'actualRepaymentAllocation',
      header: '弁済充当額',
      width: '64px',
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
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.actualRepaymentAllocation)
      },
    },
    {
      key: 'actions',
      header: '',
      width: '72px',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <div className="flex gap-0.5">
              <button
                type="button"
                onClick={() => handleSave(item)}
                className="rounded bg-blue-500 px-1 py-0.5 text-[10px] text-white hover:bg-blue-600"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded bg-slate-200 px-1 py-0.5 text-[10px] text-slate-700 hover:bg-slate-300"
              >
                取消
              </button>
            </div>
          )
        }
        return (
          <button
            type="button"
            onClick={() => handleEdit(item)}
            className="rounded px-1 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50"
          >
            編集
          </button>
        )
      },
    },
  ]

  return (
    <div className="min-h-0 space-y-3">
      <DataTable
        data={sortedPayments}
        columns={columns}
        keyField="id"
        emptyMessage="入金データがありません"
        density="compact"
      />

      <button
        type="button"
        onClick={() => {
          const newId = Math.max(0, ...allCasePayments.map((p) => p.id)) + 1
          const lastPayment = sortedPayments[sortedPayments.length - 1]
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
        className="w-full rounded border border-dashed border-blue-300 py-1.5 text-[11px] text-blue-600 transition-colors hover:bg-blue-50"
      >
        + 入金予定を追加
      </button>
    </div>
  )
}
