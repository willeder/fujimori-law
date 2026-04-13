import { useCaseDispatch } from '../store/useCaseStore'
import { EditableField, StatusBadge, DataTable, type Column } from '../components'
import type { Creditor } from '../types'

interface CreditorTabProps {
  caseId: number
  creditors: Creditor[]
  view: 'summary' | 'detail'
}

export function CreditorTab({ caseId, creditors, view }: CreditorTabProps) {
  const dispatch = useCaseDispatch()

  const updateCreditor = (creditor: Creditor, updates: Partial<Creditor>) => {
    dispatch({
      type: 'UPDATE_CREDITOR',
      payload: { ...creditor, ...updates },
    })
  }

  if (view === 'summary') {
    // 合算ビュー
    const settledCount = creditors.filter((c) =>
      ['和解済', '弁済中', '完済'].includes(c.status)
    ).length
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
        width: '132px',
      },
      {
        key: 'status',
        header: 'ステータス',
        width: '132px',
        render: (item) => <StatusBadge status={item.status} size="md" />,
      },
      {
        key: 'declaredAmount',
        header: '申告額',
        width: '108px',
        align: 'right',
        render: (item) => (
          <span className="tabular-nums">
            {item.declaredAmount?.toLocaleString()}
            <span className="ml-0.5 text-xs text-slate-400">円</span>
          </span>
        ),
      },
      {
        key: 'debtAmount',
        header: '債務額',
        width: '108px',
        align: 'right',
        render: (item) => (
          <span className="tabular-nums">
            {item.debtAmount?.toLocaleString()}
            <span className="ml-0.5 text-xs text-slate-400">円</span>
          </span>
        ),
      },
      {
        key: 'settlementAmount',
        header: '和解金額',
        width: '112px',
        align: 'right',
        render: (item) =>
          item.settlementAmount ? (
            <span className="font-medium text-green-700 tabular-nums">
              {item.settlementAmount.toLocaleString()}
              <span className="ml-0.5 text-xs text-slate-400">円</span>
            </span>
          ) : (
            <span className="text-slate-300">-</span>
          ),
      },
      {
        key: 'paymentCount',
        header: '支払回数',
        width: '88px',
        align: 'right',
        render: (item) =>
          item.paymentCount ? (
            <span className="tabular-nums">
              {item.paymentCount}
              <span className="ml-0.5 text-xs text-slate-400">回</span>
            </span>
          ) : (
            <span className="text-slate-300">-</span>
          ),
      },
      {
        key: 'settlementDate',
        header: '和解日',
        width: '108px',
        render: (item) => item.settlementDate ?? '-',
      },
    ]

    return (
      <div className="min-h-0 space-y-3">
        <div className="text-xs leading-snug text-slate-600">
          債権者数：{creditors.length}社（うち和解済：{settledCount}社）・案件ID: {caseId}
        </div>
        {/* 合計サマリ（入金スケジュールのサマリ相当の読みやすさ） */}
        <div className="grid grid-cols-2 gap-2 rounded bg-slate-50 p-2 sm:grid-cols-4">
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">債権者数</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {creditors.length}社
            </div>
          </div>
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">
              申告債務額合計
            </div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {totalDeclared.toLocaleString()}円
            </div>
          </div>
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">債務額合計</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {totalDebt.toLocaleString()}円
            </div>
          </div>
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">和解金額合計</div>
            <div className="text-sm font-bold tabular-nums text-green-700">
              {totalSettlement.toLocaleString()}円
            </div>
          </div>
        </div>

        <DataTable
          data={creditors}
          columns={columns}
          keyField="id"
          emptyMessage="債権者データがありません"
          density="default"
          bodyMaxHeightClassName="max-h-[min(72vh,40rem)]"
          cellNoWrap
        />
      </div>
    )
  }

  // 詳細ビュー（個別債権者）
  const creditor = creditors[0]
  if (!creditor) return null

  return (
    <div className="min-h-0 space-y-3">
      {/* ステータス */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={creditor.status} size="md" />
        <span className="text-xs leading-snug text-slate-600">
          交渉相手: {creditor.negotiationPartner ?? '直接'}
        </span>
      </div>

      {/* 債権情報 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <EditableField
          compact
          label="申告額"
          value={creditor.declaredAmount}
          onChange={(v) =>
            updateCreditor(creditor, { declaredAmount: Number(v) || null })
          }
          type="number"
          suffix="円"
        />
        <EditableField
          compact
          label="債務額"
          value={creditor.debtAmount}
          onChange={(v) =>
            updateCreditor(creditor, { debtAmount: Number(v) || null })
          }
          type="number"
          suffix="円"
        />
        <EditableField
          compact
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <EditableField
          compact
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
          compact
          label="受任通知送付日"
          value={creditor.acceptanceNoticeSentDate}
          onChange={(v) =>
            updateCreditor(creditor, { acceptanceNoticeSentDate: v || null })
          }
          type="date"
        />
        <EditableField
          compact
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
          <h4 className="text-xs font-semibold text-slate-600">和解内容</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <EditableField
              compact
              label="和解日"
              value={creditor.settlementDate}
              onChange={(v) =>
                updateCreditor(creditor, { settlementDate: v || null })
              }
              type="date"
            />
            <EditableField
              compact
              label="和解金額"
              value={creditor.settlementAmount}
              onChange={(v) =>
                updateCreditor(creditor, { settlementAmount: Number(v) || null })
              }
              type="number"
              suffix="円"
            />
            <EditableField
              compact
              label="支払回数"
              value={creditor.paymentCount}
              onChange={(v) =>
                updateCreditor(creditor, { paymentCount: Number(v) || null })
              }
              type="number"
              suffix="回"
            />
            <EditableField
              compact
              label="支払開始月"
              value={creditor.paymentStartMonth}
              onChange={(v) =>
                updateCreditor(creditor, { paymentStartMonth: v || null })
              }
            />
            <EditableField
              compact
              label="支払日"
              value={creditor.paymentDay}
              onChange={(v) =>
                updateCreditor(creditor, { paymentDay: Number(v) || null })
              }
              type="number"
              suffix="日"
            />
            <EditableField
              compact
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <EditableField
              compact
              label="初回支払額"
              value={creditor.firstPaymentAmount}
              onChange={(v) =>
                updateCreditor(creditor, { firstPaymentAmount: Number(v) || null })
              }
              type="number"
              suffix="円"
            />
            <EditableField
              compact
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
              compact
              label="最終支払額"
              value={creditor.finalPaymentAmount}
              onChange={(v) =>
                updateCreditor(creditor, { finalPaymentAmount: Number(v) || null })
              }
              type="number"
              suffix="円"
            />
          </div>

          <h4 className="mt-2 text-xs font-semibold text-slate-600">振込先情報</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <EditableField
              compact
              label="銀行名"
              value={creditor.bankName}
              onChange={(v) =>
                updateCreditor(creditor, { bankName: v || null })
              }
            />
            <EditableField
              compact
              label="支店名"
              value={creditor.branchName}
              onChange={(v) =>
                updateCreditor(creditor, { branchName: v || null })
              }
            />
            <EditableField
              compact
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
              compact
              label="口座番号"
              value={creditor.accountNumber}
              onChange={(v) =>
                updateCreditor(creditor, { accountNumber: v || null })
              }
            />
            <EditableField
              compact
              label="口座名義"
              value={creditor.accountHolder}
              onChange={(v) =>
                updateCreditor(creditor, { accountHolder: v || null })
              }
            />
          </div>
        </>
      )}

      {/* ④ 債権者資料（リンク/ファイル名のメモ） */}
      <hr className="border-slate-200" />
      <h4 className="text-xs font-semibold text-slate-600">債権者資料</h4>
      <div className="rounded border border-slate-100 bg-slate-50/50 p-2">
        <EditableField
          label="債権者資料"
          value={creditor.creditorDocuments ?? ''}
          onChange={(v) => updateCreditor(creditor, { creditorDocuments: v || null })}
          type="textarea"
          placeholder="例）債権調査票: driveリンク / 和解提案書: ファイル名 など"
        />
      </div>
    </div>
  )
}
