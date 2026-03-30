import { useCaseDispatch } from '../store/CaseStore'
import { EditableField, StatusBadge, DataTable, type Column } from '../components'
import type { Creditor } from '../types'

interface CreditorTabProps {
  caseId: number
  creditors: Creditor[]
  view: 'summary' | 'detail'
}

export function CreditorTab({ caseId: _caseId, creditors, view }: CreditorTabProps) {
  const dispatch = useCaseDispatch()

  const updateCreditor = (creditor: Creditor, updates: Partial<Creditor>) => {
    dispatch({
      type: 'UPDATE_CREDITOR',
      payload: { ...creditor, ...updates },
    })
  }

  if (view === 'summary') {
    // 合算ビュー
    const totalDeclared = creditors.reduce(
      (sum, c) => sum + (c.declaredAmount ?? 0),
      0
    )
    const totalDebt = creditors.reduce(
      (sum, c) => sum + (c.debtAmount ?? 0),
      0
    )
    const totalSettlement = creditors.reduce(
      (sum, c) => sum + (c.settlementAmount ?? 0),
      0
    )

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
          emptyMessage="債権者データがありません"
        />
      </div>
    )
  }

  // 詳細ビュー（個別債権者）
  const creditor = creditors[0]
  if (!creditor) return null

  return (
    <div className="space-y-6">
      {/* ステータス */}
      <div className="flex items-center gap-4">
        <StatusBadge status={creditor.status} size="md" />
        <span className="text-sm text-slate-500">
          交渉相手: {creditor.negotiationPartner ?? '直接'}
        </span>
      </div>

      {/* 債権情報 */}
      <div className="grid grid-cols-3 gap-4">
        <EditableField
          label="申告額"
          value={creditor.declaredAmount}
          onChange={(v) =>
            updateCreditor(creditor, { declaredAmount: Number(v) || null })
          }
          type="number"
          suffix="円"
        />
        <EditableField
          label="債務額"
          value={creditor.debtAmount}
          onChange={(v) =>
            updateCreditor(creditor, { debtAmount: Number(v) || null })
          }
          type="number"
          suffix="円"
        />
        <EditableField
          label="想定和解（%）"
          value={creditor.expectedSettlement}
          onChange={(v) =>
            updateCreditor(creditor, { expectedSettlement: Number(v) || null })
          }
          type="number"
          suffix="%"
        />
      </div>

      {/* 進行状況 */}
      <div className="grid grid-cols-3 gap-4">
        <EditableField
          label="ステータス"
          value={creditor.status}
          onChange={(v) => updateCreditor(creditor, { status: v as Creditor['status'] })}
          type="select"
          options={[
            { value: '受任通知発送待ち', label: '受任通知発送待ち' },
            { value: '受任通知発送済', label: '受任通知発送済' },
            { value: '債権調査中', label: '債権調査中' },
            { value: '和解提案中', label: '和解提案中' },
            { value: '和解済', label: '和解済' },
            { value: '弁済中', label: '弁済中' },
            { value: '完済', label: '完済' },
          ]}
        />
        <EditableField
          label="受任通知送付日"
          value={creditor.acceptanceNoticeSentDate}
          onChange={(v) =>
            updateCreditor(creditor, { acceptanceNoticeSentDate: v || null })
          }
          type="date"
        />
        <EditableField
          label="次回処理日時"
          value={creditor.nextProcessDate}
          onChange={(v) =>
            updateCreditor(creditor, { nextProcessDate: v || null })
          }
          type="date"
        />
      </div>

      {/* 和解内容（和解済みの場合のみ編集可能） */}
      {['和解済', '弁済中', '完済'].includes(creditor.status) && (
        <>
          <hr className="border-slate-200" />
          <h4 className="font-medium text-slate-700">和解内容</h4>
          <div className="grid grid-cols-3 gap-4">
            <EditableField
              label="和解日"
              value={creditor.settlementDate}
              onChange={(v) =>
                updateCreditor(creditor, { settlementDate: v || null })
              }
              type="date"
            />
            <EditableField
              label="和解金額"
              value={creditor.settlementAmount}
              onChange={(v) =>
                updateCreditor(creditor, { settlementAmount: Number(v) || null })
              }
              type="number"
              suffix="円"
            />
            <EditableField
              label="支払回数"
              value={creditor.paymentCount}
              onChange={(v) =>
                updateCreditor(creditor, { paymentCount: Number(v) || null })
              }
              type="number"
              suffix="回"
            />
            <EditableField
              label="支払開始月"
              value={creditor.paymentStartMonth}
              onChange={(v) =>
                updateCreditor(creditor, { paymentStartMonth: v || null })
              }
            />
            <EditableField
              label="支払日"
              value={creditor.paymentDay}
              onChange={(v) =>
                updateCreditor(creditor, { paymentDay: Number(v) || null })
              }
              type="number"
              suffix="日"
            />
            <EditableField
              label="将来利息"
              value={creditor.futureInterest}
              onChange={(v) =>
                updateCreditor(creditor, { futureInterest: v || null })
              }
              type="select"
              options={[
                { value: 'なし', label: 'なし' },
                { value: 'あり', label: 'あり' },
              ]}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <EditableField
              label="初回支払額"
              value={creditor.firstPaymentAmount}
              onChange={(v) =>
                updateCreditor(creditor, { firstPaymentAmount: Number(v) || null })
              }
              type="number"
              suffix="円"
            />
            <EditableField
              label="２回目以降支払額"
              value={creditor.subsequentPaymentAmount}
              onChange={(v) =>
                updateCreditor(creditor, {
                  subsequentPaymentAmount: Number(v) || null,
                })
              }
              type="number"
              suffix="円"
            />
            <EditableField
              label="最終支払額"
              value={creditor.finalPaymentAmount}
              onChange={(v) =>
                updateCreditor(creditor, { finalPaymentAmount: Number(v) || null })
              }
              type="number"
              suffix="円"
            />
          </div>

          <h4 className="font-medium text-slate-700 mt-4">振込先情報</h4>
          <div className="grid grid-cols-3 gap-4">
            <EditableField
              label="銀行名"
              value={creditor.bankName}
              onChange={(v) =>
                updateCreditor(creditor, { bankName: v || null })
              }
            />
            <EditableField
              label="支店名"
              value={creditor.branchName}
              onChange={(v) =>
                updateCreditor(creditor, { branchName: v || null })
              }
            />
            <EditableField
              label="口座種別"
              value={creditor.accountType}
              onChange={(v) =>
                updateCreditor(creditor, { accountType: v || null })
              }
              type="select"
              options={[
                { value: '普通', label: '普通' },
                { value: '当座', label: '当座' },
              ]}
            />
            <EditableField
              label="口座番号"
              value={creditor.accountNumber}
              onChange={(v) =>
                updateCreditor(creditor, { accountNumber: v || null })
              }
            />
            <EditableField
              label="口座名義"
              value={creditor.accountHolder}
              onChange={(v) =>
                updateCreditor(creditor, { accountHolder: v || null })
              }
            />
          </div>
        </>
      )}
    </div>
  )
}
