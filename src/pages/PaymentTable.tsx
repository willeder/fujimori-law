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
  const isNegative = n < 0
  return <span className={isNegative ? 'text-red-600' : ''}>{n.toLocaleString()}</span>
}

/**
 * 実入金額に基づいて各充当額を自動計算
 *
 * 入金情報の計上定義:
 * ①プール金の計算（予定時）
 *   新計算式: 入金予定額 - 報酬充当予定額 - 弁代報酬充当予定額 - 弁済充当予定額 - 手数料
 *   ※手数料と同額のプール金計上は廃止
 *
 * ②実入金反映時
 *   A) 予定金額と同額：予定の各項目の数値を反映
 *   B) 予定金額より超過：報酬額などは予定のまま、プール金へ差額を加算
 *   C) 予定金額より不足：実入金額に合わせて各項目を反映し、補充行を追加
 *
 * 充当優先順位: 弁済 → 弁代報酬 → 手数料 → 報酬
 */
function calculateActualAllocations(
  payment: PaymentRecord,
  actualAmount: number | null
): Partial<PaymentRecord> {
  if (actualAmount == null) {
    return {
      actualFeeAllocation: null,
      actualAgentFeeAllocation: null,
      actualPoolAllocation: null,
      actualRepaymentAllocation: null,
    }
  }

  const plannedAmount = payment.plannedAmount ?? 0

  // A) 予定金額と同額の場合：予定の各項目の数値をそのまま反映
  if (actualAmount === plannedAmount) {
    return {
      actualFeeAllocation: payment.plannedFeeAllocation,
      actualAgentFeeAllocation: payment.plannedAgentFeeAllocation,
      actualPoolAllocation: payment.plannedPoolAllocation,
      actualRepaymentAllocation: payment.plannedRepaymentAllocation,
    }
  }

  // B) 予定金額より超過の場合：報酬額などは予定のまま、プール金へ差額を加算
  if (actualAmount > plannedAmount) {
    const excess = actualAmount - plannedAmount
    const basePool = payment.plannedPoolAllocation ?? 0
    return {
      actualFeeAllocation: payment.plannedFeeAllocation,
      actualAgentFeeAllocation: payment.plannedAgentFeeAllocation,
      actualPoolAllocation: basePool + excess,
      actualRepaymentAllocation: payment.plannedRepaymentAllocation,
    }
  }

  // C) 予定金額より不足の場合：実入金額に合わせて各項目を反映
  // 充当優先順位: 弁済 → 弁代報酬 → 手数料 → 報酬 → プール
  const plannedRepayment = payment.plannedRepaymentAllocation ?? 0
  const plannedAgentFee = payment.plannedAgentFeeAllocation ?? 0
  const plannedHandlingFee = payment.handlingFee ?? 0
  const plannedFee = payment.plannedFeeAllocation ?? 0

  let remaining = actualAmount

  // 1. 弁済充当（最優先、予定額まで）
  const actualRepayment = Math.min(remaining, plannedRepayment)
  remaining -= actualRepayment

  // 2. 弁代報酬充当（予定額まで）
  const actualAgentFee = Math.min(remaining, plannedAgentFee)
  remaining -= actualAgentFee

  // 3. 手数料（予定額まで）
  const actualHandlingFee = Math.min(remaining, plannedHandlingFee)
  remaining -= actualHandlingFee

  // 4. 報酬充当（予定額まで）
  const actualFee = Math.min(remaining, plannedFee)
  remaining -= actualFee

  // 5. プール金（残り）
  const actualPool = remaining

  return {
    actualRepaymentAllocation: actualRepayment > 0 ? actualRepayment : null,
    actualAgentFeeAllocation: actualAgentFee > 0 ? actualAgentFee : null,
    actualPoolAllocation: actualPool > 0 ? actualPool : null,
    actualFeeAllocation: actualFee > 0 ? actualFee : null,
    handlingFee: actualHandlingFee > 0 ? actualHandlingFee : null,
  }
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
      // 予定
      plannedDate: payment.plannedDate,
      plannedAmount: payment.plannedAmount,
      plannedFeeAllocation: payment.plannedFeeAllocation,
      plannedAgentFeeAllocation: payment.plannedAgentFeeAllocation,
      plannedPoolAllocation: payment.plannedPoolAllocation,
      plannedRepaymentAllocation: payment.plannedRepaymentAllocation,
      repaymentCount: payment.repaymentCount,
      handlingFee: payment.handlingFee,
      // 実績
      actualDate: payment.actualDate,
      actualAmount: payment.actualAmount,
      actualFeeAllocation: payment.actualFeeAllocation,
      actualAgentFeeAllocation: payment.actualAgentFeeAllocation,
      actualPoolAllocation: payment.actualPoolAllocation,
      actualRepaymentAllocation: payment.actualRepaymentAllocation,
    })
  }

  const handleSave = (payment: PaymentRecord) => {
    let finalData = { ...editData }

    // 実入金日が入力されている場合、充当額を自動計算
    if (finalData.actualDate) {
      // 実入金額が未入力なら予定額をデフォルトで使用
      const actualAmount = finalData.actualAmount ?? payment.plannedAmount
      finalData.actualAmount = actualAmount

      // 各充当額を自動計算（手動入力がない場合のみ）
      const calculated = calculateActualAllocations(payment, actualAmount)
      if (finalData.actualFeeAllocation === payment.actualFeeAllocation) {
        finalData.actualFeeAllocation = calculated.actualFeeAllocation
      }
      if (finalData.actualAgentFeeAllocation === payment.actualAgentFeeAllocation) {
        finalData.actualAgentFeeAllocation = calculated.actualAgentFeeAllocation
      }
      if (finalData.actualPoolAllocation === payment.actualPoolAllocation) {
        finalData.actualPoolAllocation = calculated.actualPoolAllocation
      }
      if (finalData.actualRepaymentAllocation === payment.actualRepaymentAllocation) {
        finalData.actualRepaymentAllocation = calculated.actualRepaymentAllocation
      }

      // 実入金が不足の場合、補充レコードを追加
      const plannedAmount = payment.plannedAmount ?? 0
      const shortage = plannedAmount - (actualAmount ?? 0)
      if (shortage > 0 && finalData.actualDate) {
        // 今回の入金の次の入金を探す
        const currentIndex = sortedPayments.findIndex((p) => p.id === payment.id)
        const nextPayment = sortedPayments[currentIndex + 1]

        // 補充レコードの入金予定日を決定
        // 今回の入金日の翌日、または次回入金日の前日
        let supplementDate: string
        const currentDate = new Date(finalData.actualDate)
        if (nextPayment?.plannedDate) {
          const nextDate = new Date(nextPayment.plannedDate)
          // 次回入金日の1日前
          nextDate.setDate(nextDate.getDate() - 1)
          // 今回の入金日より後であることを確認
          if (nextDate > currentDate) {
            supplementDate = nextDate.toISOString().split('T')[0]
          } else {
            // 今回の入金日の翌日
            currentDate.setDate(currentDate.getDate() + 1)
            supplementDate = currentDate.toISOString().split('T')[0]
          }
        } else {
          // 次回入金がない場合、今回の入金日の翌日
          currentDate.setDate(currentDate.getDate() + 1)
          supplementDate = currentDate.toISOString().split('T')[0]
        }

        // 新しい補充レコードを追加（サーバへも作成）
        const newId = Math.max(0, ...allCasePayments.map((p) => p.id)) + 1
        createPaymentRow({
          id: newId,
          caseId,
          creditorId: payment.creditorId,
          creditorInstallmentIndex: null,
          plannedDate: supplementDate,
          plannedAmount: shortage,
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
        })
      }
    }

    dispatch({
      type: 'UPDATE_PAYMENT',
      payload: {
        ...payment,
        ...finalData,
      },
    })
    // 既存入金レコードはサーバへ永続化（変更履歴/監査はサーバ側）。
    // 自動補充で追加されたローカル行（DB未登録）は対象外（404は握りつぶす）。
    if (payment.id != null) {
      void fetch(`/api/payments/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      }).catch((e) => console.error('入金更新の保存に失敗:', e))
    }
    setEditingId(null)
    setEditData({})
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditData({})
  }

  // 新規入金行を楽観的に追加しつつサーバへ作成。成功したら合成IDを実IDへ差し替える。
  const createPaymentRow = (record: PaymentRecord) => {
    dispatch({ type: 'ADD_PAYMENT', payload: record })
    void fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { row?: PaymentRecord } | null) => {
        if (res?.row && res.row.id !== record.id) {
          dispatch({ type: 'DELETE_PAYMENT', payload: record.id })
          dispatch({ type: 'ADD_PAYMENT', payload: res.row })
        }
      })
      .catch((e) => console.error('入金の作成に失敗:', e))
  }

  const inputCls =
    'box-border w-full min-w-0 max-w-full rounded border border-blue-300 px-1.5 py-0.5 text-xs leading-tight [color-scheme:light]'

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
      header: '入金日',
      width: '6rem',
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
          <span
            className={`whitespace-nowrap ${!item.actualDate ? 'font-medium text-slate-800' : ''}`}
          >
            {item.plannedDate ?? <span className="text-slate-300">-</span>}
          </span>
        )
      },
    },
    {
      key: 'plannedAmount',
      header: '入金額',
      width: '4.5rem',
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
      key: 'plannedFeeAllocation',
      header: '報酬額',
      width: '4rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.plannedFeeAllocation ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedFeeAllocation: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.plannedFeeAllocation)
      },
    },
    {
      key: 'plannedAgentFeeAllocation',
      header: '弁代報酬',
      width: '4rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.plannedAgentFeeAllocation ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedAgentFeeAllocation: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.plannedAgentFeeAllocation)
      },
    },
    {
      key: 'plannedPoolAllocation',
      header: 'ﾌﾟｰﾙ',
      width: '3.5rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.plannedPoolAllocation ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedPoolAllocation: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.plannedPoolAllocation)
      },
    },
    {
      key: 'repaymentCount',
      header: '社数',
      width: '2.5rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.repaymentCount ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, repaymentCount: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.repaymentCount)
      },
    },
    {
      key: 'handlingFee',
      header: '手数料',
      width: '3.5rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.handlingFee ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, handlingFee: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.handlingFee)
      },
    },
    {
      key: 'plannedRepaymentAllocation',
      header: '弁済額',
      width: '4.5rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.plannedRepaymentAllocation ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedRepaymentAllocation: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.plannedRepaymentAllocation)
      },
    },
    {
      key: 'actualDate',
      header: '実入金日',
      width: '5rem',
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
      header: '実入金額',
      width: '4.5rem',
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
      key: 'actualFeeAllocation',
      header: '報酬充当',
      width: '4rem',
      align: 'right',
      headerClassName: 'bg-blue-50 whitespace-nowrap',
      sortable: false,
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
      header: '弁代充当',
      width: '4rem',
      align: 'right',
      headerClassName: 'bg-blue-50 whitespace-nowrap',
      sortable: false,
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
      header: 'ﾌﾟｰﾙ充当',
      width: '3.5rem',
      align: 'right',
      headerClassName: 'bg-blue-50 whitespace-nowrap',
      sortable: false,
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
      width: '2rem',
      align: 'right',
      sortable: false,
      headerClassName: 'bg-blue-50',
      render: (item) =>
        item.actualDate ? fmtNum(item.repaymentCount) : <span className="text-slate-300">-</span>,
    },
    {
      key: 'handlingFeeActual',
      header: '手数料',
      width: '3.5rem',
      align: 'right',
      sortable: false,
      headerClassName: 'bg-blue-50',
      render: (item) =>
        item.actualDate ? fmtNum(item.handlingFee) : <span className="text-slate-300">-</span>,
    },
    {
      key: 'actualRepaymentAllocation',
      header: '弁済充当',
      width: '4.5rem',
      align: 'right',
      headerClassName: 'bg-blue-50 whitespace-nowrap',
      sortable: false,
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
      <DataTable
        data={sortedPayments}
        columns={columns}
        keyField="id"
        emptyMessage="入金データがありません"
        density="default"
        stickyHeader
        cellSingleLine
        suspendTruncate={editingId !== null}
        enableFind
        bodyMaxHeightClassName="max-h-[min(60vh,32rem)]"
        getRowClassName={(item) => {
          // 実入金日がない場合はデフォルト
          if (!item.actualDate) return ''
          const planned = item.plannedAmount ?? 0
          const actual = item.actualAmount ?? 0
          // 実入金額 < 予定額: 赤い背景
          if (actual < planned) return 'bg-red-50'
          // 実入金額 > 予定額: 青い背景
          if (actual > planned) return 'bg-blue-50'
          return ''
        }}
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
          createPaymentRow({
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
          })
        }}
        className="w-full rounded border border-dashed border-blue-300 py-1 text-[11px] text-blue-600 transition-colors hover:bg-blue-50"
      >
        + 入金予定を追加
      </button>
    </div>
  )
}
