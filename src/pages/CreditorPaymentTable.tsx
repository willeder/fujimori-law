import { useState } from 'react'
import { useCaseDispatch, usePaymentsByCaseId } from '../store/useCaseStore'
import { DataTable, type Column } from '../components'
import type { PaymentRecord, Creditor } from '../types'

interface CreditorPaymentTableProps {
  caseId: number
  creditor: Creditor
  payments: PaymentRecord[]
}

function fmtNum(n: number | null | undefined) {
  if (n == null) return <span className="text-slate-300">-</span>
  const isNegative = n < 0
  return <span className={isNegative ? 'text-red-600' : ''}>{n.toLocaleString()}</span>
}

export function CreditorPaymentTable({
  caseId,
  creditor,
  payments,
}: CreditorPaymentTableProps) {
  const dispatch = useCaseDispatch()
  const allCasePayments = usePaymentsByCaseId(caseId)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<Partial<PaymentRecord>>({})

  // 和解済みかどうか（和解日があれば和解済み）
  const isSettled = creditor.settlementDate != null

  // サマリ計算
  const settlementAmount = isSettled
    ? creditor.settlementAmount
    : creditor.expectedSettlementAmount
  const paymentCount = isSettled
    ? creditor.paymentCount
    : creditor.expectedPaymentCount
  const futureInterest = isSettled
    ? creditor.futureInterest
    : creditor.expectedFutureInterest

  // 弁済済みのレコード（弁済日がある）
  const paidPayments = payments.filter((p) => p.actualDate != null)
  const cumulativePaidAmount = paidPayments.reduce(
    (sum, p) => sum + (p.actualAmount ?? 0),
    0
  )
  const cumulativePaidCount = paidPayments.length
  const lastPaidDate = paidPayments.length > 0
    ? paidPayments
        .map((p) => p.actualDate)
        .filter(Boolean)
        .sort()
        .reverse()[0]
    : null

  // 残額・残回数
  const remainingAmount = (settlementAmount ?? 0) - (isSettled ? cumulativePaidAmount : 0)
  const remainingCount = (paymentCount ?? 0) - (isSettled ? cumulativePaidCount : 0)

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
      plannedDate: payment.plannedDate,
      plannedAmount: payment.plannedAmount,
      actualDate: payment.actualDate,
      actualAmount: payment.actualAmount,
    })
  }

  const handleSave = (payment: PaymentRecord) => {
    dispatch({
      type: 'UPDATE_PAYMENT',
      payload: {
        ...payment,
        plannedDate: editData.plannedDate ?? null,
        plannedAmount: editData.plannedAmount ?? null,
        actualDate: editData.actualDate ?? null,
        actualAmount: editData.actualAmount ?? null,
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
    'box-border w-full min-w-0 max-w-full rounded border border-blue-300 px-1.5 py-0.5 text-xs leading-tight [color-scheme:light]'

  // サマリのスタイル（和解後は青太字）
  const summaryValueClass = isSettled
    ? 'font-bold text-blue-600 tabular-nums'
    : 'tabular-nums text-slate-700'

  const columns: Column<PaymentRecord>[] = [
    {
      key: '__rowIndex',
      header: '',
      width: '2rem',
      align: 'center',
      sortable: false,
      headerClassName: 'bg-white',
      render: (_item, index) => (
        <span className="text-slate-500 tabular-nums">{index + 1}</span>
      ),
    },
    {
      key: 'plannedDate',
      header: '弁済予定日',
      width: '7rem',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="date"
              value={editData.plannedDate ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedDate: e.target.value || null })
              }
              className={inputCls}
            />
          )
        }
        return (
          <span className={`whitespace-nowrap ${!item.actualDate ? 'font-medium text-slate-800' : ''}`}>
            {item.plannedDate ?? <span className="text-slate-300">-</span>}
          </span>
        )
      },
    },
    {
      key: 'plannedAmount',
      header: '弁済予定額',
      width: '6rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.plannedAmount ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedAmount: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.plannedAmount)
      },
    },
    {
      key: 'actualDate',
      header: '弁済日',
      width: '7rem',
      headerClassName: 'bg-blue-50',
      sortable: false,
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
          <span className="whitespace-nowrap text-green-700">{item.actualDate}</span>
        ) : (
          <span className="whitespace-nowrap text-slate-300">未</span>
        )
      },
    },
    {
      key: 'actualAmount',
      header: '弁済額',
      width: '6rem',
      align: 'right',
      headerClassName: 'bg-blue-50',
      sortable: false,
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
      key: 'actions',
      header: '',
      width: '5rem',
      cellTruncate: false,
      sortable: false,
      headerClassName: 'bg-blue-50',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <div className="flex shrink-0 flex-nowrap items-center gap-1">
              <button
                type="button"
                onClick={() => handleSave(item)}
                className="rounded bg-blue-500 px-2 py-0.5 text-xs text-white hover:bg-blue-600"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-300"
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
            className="rounded px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50"
          >
            編集
          </button>
        )
      },
    },
  ]

  return (
    <div className="min-h-0 space-y-3">
      {/* サマリ表示 */}
      <div className="grid grid-cols-4 gap-2 rounded bg-slate-50 p-2 sm:grid-cols-8">
        <div>
          <div className="text-[10px] font-medium leading-tight text-slate-500">
            {isSettled ? '和解金額' : '和解予定額'}
          </div>
          <div className={`text-sm ${summaryValueClass}`}>
            {settlementAmount != null ? `${settlementAmount.toLocaleString()}円` : '-'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium leading-tight text-slate-500">
            {isSettled ? '和解回数' : '和解予定回数'}
          </div>
          <div className={`text-sm ${summaryValueClass}`}>
            {paymentCount != null ? `${paymentCount}回` : '-'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium leading-tight text-slate-500">
            {isSettled ? '将来利息' : '予定利息'}
          </div>
          <div className={`text-sm ${summaryValueClass}`}>
            {futureInterest ?? '-'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium leading-tight text-slate-500">累計弁済額</div>
          <div className={`text-sm ${summaryValueClass}`}>
            {isSettled ? `${cumulativePaidAmount.toLocaleString()}円` : '-'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium leading-tight text-slate-500">弁済残金額</div>
          <div className={`text-sm ${summaryValueClass}`}>
            {settlementAmount != null
              ? `${remainingAmount.toLocaleString()}円`
              : '-'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium leading-tight text-slate-500">累計弁済回数</div>
          <div className={`text-sm ${summaryValueClass}`}>
            {isSettled ? `${cumulativePaidCount}回` : '-'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium leading-tight text-slate-500">弁済残回数</div>
          <div className={`text-sm ${summaryValueClass}`}>
            {paymentCount != null ? `${remainingCount}回` : '-'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium leading-tight text-slate-500">最終弁済日</div>
          <div className={`text-sm ${summaryValueClass}`}>
            {isSettled && lastPaidDate ? lastPaidDate : '-'}
          </div>
        </div>
      </div>

      {/* 一覧 */}
      <DataTable
        data={sortedPayments}
        columns={columns}
        keyField="id"
        emptyMessage="弁済データがありません"
        density="default"
        stickyHeader
        cellSingleLine
        suspendTruncate={editingId !== null}
        getRowClassName={(item) => {
          if (!item.actualDate) return ''
          const planned = item.plannedAmount ?? 0
          const actual = item.actualAmount ?? 0
          if (actual < planned) return 'bg-red-50'
          if (actual > planned) return 'bg-blue-50'
          return ''
        }}
      />

      <button
        type="button"
        onClick={() => {
          const newId = Math.max(0, ...allCasePayments.map((p) => p.id)) + 1
          const lastPayment = sortedPayments[sortedPayments.length - 1]
          const prevInstallmentMax = payments.reduce(
            (m, p) => Math.max(m, p.creditorInstallmentIndex ?? 0),
            0
          )
          dispatch({
            type: 'ADD_PAYMENT',
            payload: {
              id: newId,
              caseId,
              creditorId: creditor.id,
              creditorInstallmentIndex: prevInstallmentMax + 1,
              plannedDate: null,
              plannedAmount: lastPayment?.plannedAmount ?? null,
              plannedFeeAllocation: null,
              plannedAgentFeeAllocation: null,
              plannedPoolAllocation: null,
              plannedRepaymentAllocation: null,
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
        className="w-full rounded border border-dashed border-blue-300 py-1 text-[11px] text-blue-600 transition-colors hover:bg-blue-50"
      >
        + 弁済予定を追加
      </button>
    </div>
  )
}
