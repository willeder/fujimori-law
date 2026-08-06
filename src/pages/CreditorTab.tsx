import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCaseDispatch } from '../store/useCaseStore'
import { useFoundSet } from '../store/FoundSet'
import { EditableField, StatusBadge, DataTable, type Column } from '../components'
import { CreditorFiles } from '../components/case/CreditorFiles'
import type { Creditor } from '../types'
import {
  ACCOUNT_TYPE_OPTIONS,
  CREDITOR_STATUS_OPTIONS,
  YES_NO_OPTIONS,
  toSelectOptions,
} from '../constants/fieldOptions'

interface CreditorTabProps {
  caseId: number
  creditors: Creditor[]
  view: 'summary' | 'detail'
}

// 債権者名の入力候補（DB全体の既存債権者名）。表記ゆれ防止のため
// ドロップダウン選択＋自由入力の両方を可能にする。取得は1回だけ（モジュール内キャッシュ）。
let __creditorNameSuggestions: string[] | null = null

export function CreditorTab({ caseId, creditors, view }: CreditorTabProps) {
  const dispatch = useCaseDispatch()
  const navigate = useNavigate()
  const { setFoundSet } = useFoundSet()

  const [creditorNameSuggestions, setCreditorNameSuggestions] = useState<string[]>(
    () => __creditorNameSuggestions ?? []
  )
  useEffect(() => {
    if (__creditorNameSuggestions) return
    let alive = true
    fetch('/api/creditors/names')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { names?: string[] } | null) => {
        const names = [...new Set(d?.names ?? [])]
        __creditorNameSuggestions = names
        if (alive) setCreditorNameSuggestions(names)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // 債権者検索を実行：DB全体を横断検索し、該当する案件群を「検索結果セット」にして
  // 1件目の案件詳細へ移動する。以降は詳細ページの左右ナビ（◀ ▶）で渡り歩ける。
  const runCreditorFind = async (
    conditions: { field: string; value: string }[]
  ) => {
    try {
      const r = await fetch('/api/creditors/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions }),
      })
      const rows = (r.ok ? ((await r.json()) as Creditor[]) : []) ?? []
      if (rows.length === 0) {
        alert('該当する債権者が見つかりませんでした')
        return
      }
      const items = rows.map((c) => ({
        caseId: c.caseId,
        creditorId: c.id,
        label: c.creditorName,
      }))
      const desc = conditions.map((c) => `${c.field}=${c.value}`).join(' / ')
      setFoundSet(items, desc)
      navigate(`/cases/${items[0].caseId}`, {
        state: { focusCreditorId: items[0].creditorId },
      })
    } catch {
      alert('検索に失敗しました')
    }
  }

  const updateCreditor = (creditor: Creditor, updates: Partial<Creditor>) => {
    // 楽観的にローカル反映
    dispatch({
      type: 'UPDATE_CREDITOR',
      payload: { ...creditor, ...updates },
    })
    // サーバへ永続化（差分判定・変更履歴/監査はサーバ側）
    if (creditor.id != null) {
      void fetch(`/api/creditors/${creditor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch((e) => console.error('債権者更新の保存に失敗:', e))
    }
  }

  if (view === 'summary') {
    // 合算ビュー。集計（社数・各金額）は受任対象（=「受任対象外」以外）のみで行う。
    // 受任対象外は明細テーブルには表示するが、サマリの件数・合計には含めない。
    const accepted = creditors.filter((c) => c.status !== '受任対象外')
    const settledCount = accepted.filter((c) =>
      ['和解済', '弁済中', '完済'].includes(c.status)
    ).length
    const totalDeclared = accepted.reduce(
      (sum, c) => sum + (c.declaredAmount ?? 0),
      0
    )
    const totalDebt = accepted.reduce(
      (sum, c) => sum + (c.debtAmount ?? 0),
      0
    )
    const totalSettlement = accepted.reduce(
      (sum, c) => sum + (c.settlementAmount ?? 0),
      0
    )

    const columns: Column<Creditor>[] = [
      {
        key: 'status',
        header: 'ステータス',
        width: '120px',
        cellTruncate: false,
        render: (item) => <StatusBadge status={item.status} size="sm" />,
      },
      {
        // 個別画面の「弁済対象」・GMO送金の対象判定（gmoTransfer.ts）と同じ
        // repaymentTarget を参照する。repaymentExcluded は移行時に常に null が
        // 入る未使用項目で、以前はこの列だけが空欄になっていた。
        key: 'repaymentTarget',
        header: '弁済除外',
        width: '80px',
        cellTruncate: false,
        render: (item) => {
          const isExcluded = item.repaymentTarget === '停止' || item.repaymentTarget === '終了'
          return (
            <select
              value={item.repaymentTarget ?? ''}
              onChange={(e) => {
                const value = e.target.value as '停止' | '終了' | ''
                updateCreditor(item, {
                  repaymentTarget: value === '' ? null : value,
                })
              }}
              className={`w-full rounded border border-slate-200 px-1 py-0.5 text-xs ${
                isExcluded ? 'font-bold text-red-600' : 'text-slate-700'
              }`}
            >
              <option value="">-</option>
              <option value="停止" className="font-bold text-red-600">停止</option>
              <option value="終了" className="font-bold text-red-600">終了</option>
            </select>
          )
        },
      },
      {
        key: 'creditorName',
        header: '債権者',
        // 合算/求償分などの長い債権者名を省略せず全表示（最大50文字は折り返して表示）。
        width: '13rem',
        cellTruncate: false,
        cellMultiline: true,
        // 検索モード（Shift+F）の条件入力に債権者候補ドロップダウンを表示
        filterSuggestions: creditorNameSuggestions,
        render: (item) => (item.creditorName ?? '').slice(0, 50),
      },
      {
        key: 'acceptanceNoticeSentDate',
        header: '受任通知送付日',
        width: '100px',
        render: (item) => item.acceptanceNoticeSentDate ?? '-',
      },
      {
        key: 'settlementProposalDate',
        header: '和解提案日',
        width: '96px',
        render: (item) => item.settlementProposalDate ?? '-',
      },
      {
        key: 'settlementDate',
        header: '和解日',
        width: '110px',
        render: (item) => item.settlementDate ?? '-',
      },
      {
        key: 'declaredAmount',
        header: '申告額',
        width: '100px',
        align: 'right',
        render: (item) => (
          <span className="tabular-nums">
            {item.declaredAmount?.toLocaleString() ?? '-'}
            {item.declaredAmount && <span className="ml-0.5 text-[8px] text-slate-400">円</span>}
          </span>
        ),
      },
      {
        key: 'debtAmount',
        header: '債務額',
        width: '100px',
        align: 'right',
        render: (item) => (
          <span className="tabular-nums">
            {item.debtAmount?.toLocaleString() ?? '-'}
            {item.debtAmount && <span className="ml-0.5 text-[8px] text-slate-400">円</span>}
          </span>
        ),
      },
      {
        key: 'difference',
        header: '差額',
        width: '100px',
        align: 'right',
        render: (item) => {
          const diff = (item.debtAmount ?? 0) - (item.declaredAmount ?? 0)
          const isNegative = diff < 0
          return (
            <span className={`tabular-nums ${isNegative ? 'text-red-600' : ''}`}>
              {diff !== 0 ? diff.toLocaleString() : '-'}
              {diff !== 0 && <span className="ml-0.5 text-[8px] text-slate-400">円</span>}
            </span>
          )
        },
      },
      {
        key: 'settlementDebtAmount',
        header: '和解時債務金額',
        width: '120px',
        align: 'right',
        render: (item) => (
          <span className="tabular-nums">
            {item.settlementDebtAmount?.toLocaleString() ?? '-'}
            {item.settlementDebtAmount && <span className="ml-0.5 text-[8px] text-slate-400">円</span>}
          </span>
        ),
      },
      {
        key: 'settlementAmount',
        header: '和解',
        width: '100px',
        align: 'right',
        render: (item) =>
          item.settlementAmount ? (
            <span className="font-medium text-green-700 tabular-nums">
              {item.settlementAmount.toLocaleString()}
              <span className="ml-0.5 text-[8px] text-slate-400">円</span>
            </span>
          ) : (
            <span className="text-slate-300">-</span>
          ),
      },
    ]

    return (
      <div className="min-h-0 space-y-3">
        <div className="text-xs leading-snug text-slate-600">
          債権者数：{accepted.length}社
          {creditors.length !== accepted.length && (
            <span className="text-slate-400">（受任対象外{creditors.length - accepted.length}社を除く）</span>
          )}
          （うち和解済：{settledCount}社）・案件ID: {caseId}
        </div>
        {/* 合計サマリ（入金スケジュールのサマリ相当の読みやすさ） */}
        <div className="grid grid-cols-2 gap-2 rounded bg-slate-50 p-2 sm:grid-cols-4">
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">債権者数</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {accepted.length}社
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
          density="dense"
          bodyMaxHeightClassName="max-h-[min(72vh,40rem)]"
          cellSingleLine
          enableFind
          onFindNavigate={runCreditorFind}
        />
      </div>
    )
  }

  // 詳細ビュー（個別債権者）
  const creditor = creditors[0]
  if (!creditor) return null

  const debtDifference = (creditor.debtAmount ?? 0) - (creditor.declaredAmount ?? 0)

  return (
    <div className="grid w-full max-w-full grid-cols-5 content-start gap-x-0.5 gap-y-0.5 self-start">
      {/* 1行目: ステータス(1), 次回処理日時(1), メモ(3) */}
      <div className="min-w-0 col-span-1">
        <EditableField
          label="ステータス"
          value={creditor.status}
          onChange={(v) => updateCreditor(creditor, { status: v as Creditor['status'] })}
          type="select"
          options={toSelectOptions(CREDITOR_STATUS_OPTIONS)}
          renderValue={(v) =>
            v === '受任対象外' ? (
              <span className="inline-block rounded bg-black px-1 py-px font-medium text-white">
                {v}
              </span>
            ) : (
              (v as string) || '-'
            )
          }
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="次回処理日時"
          value={creditor.nextProcessDate}
          onChange={(v) =>
            updateCreditor(creditor, { nextProcessDate: v || null })
          }
          type="date"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-3">
        <EditableField
          label="メモ"
          value={creditor.memo}
          onChange={(v) =>
            updateCreditor(creditor, { memo: v || null })
          }
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>

      {/* 2行目: 債権者(2), 申告額(1), 想定和解(1), 受任通知送付日(1) */}
      <div className="min-w-0 col-span-2">
        <EditableField
          label="債権者"
          value={creditor.creditorName}
          onChange={(v) =>
            updateCreditor(creditor, { creditorName: v || '' })
          }
          suggestions={creditorNameSuggestions}
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="申告額"
          value={creditor.declaredAmount}
          onChange={(v) =>
            updateCreditor(creditor, { declaredAmount: Number(v) || null })
          }
          type="number"
          suffix="円"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="想定和解"
          value={creditor.expectedSettlement}
          onChange={(v) =>
            updateCreditor(creditor, { expectedSettlement: Number(v) || null })
          }
          type="number"
          suffix="回"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="受任通知送付日"
          value={creditor.acceptanceNoticeSentDate}
          onChange={(v) =>
            updateCreditor(creditor, { acceptanceNoticeSentDate: v || null })
          }
          type="date"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>

      {/* 3行目: 債権調査到着日(1), 調査票_契約日(1), 顧客コード(1), 債務額(1), 差額(1) */}
      <div className="min-w-0 col-span-1">
        <EditableField
          label="債権調査到着日"
          value={creditor.debtInquiryArrivalDate}
          onChange={(v) =>
            updateCreditor(creditor, { debtInquiryArrivalDate: v || null })
          }
          type="date"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="調査票_契約日"
          value={creditor.contractDate}
          onChange={(v) =>
            updateCreditor(creditor, { contractDate: v || null })
          }
          type="date"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="顧客コード"
          value={creditor.customerCode}
          onChange={(v) =>
            updateCreditor(creditor, { customerCode: v || null })
          }
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="債務額"
          value={creditor.debtAmount}
          onChange={(v) =>
            updateCreditor(creditor, { debtAmount: Number(v) || null })
          }
          type="number"
          suffix="円"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="差額"
          value={debtDifference !== 0 ? debtDifference : null}
          onChange={() => {}}
          type="number"
          suffix="円"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
          disabled
        />
      </div>

      {/* 4行目(左寄せ): 和解提案日(1), 和解提案(1), 回答状況(1), 空(2) */}
      <div className="min-w-0 col-span-1">
        <EditableField
          label="和解提案日"
          value={creditor.settlementProposalDate}
          onChange={(v) =>
            updateCreditor(creditor, { settlementProposalDate: v || null })
          }
          type="date"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="和解提案"
          value={creditor.settlementProposal}
          onChange={(v) =>
            updateCreditor(creditor, { settlementProposal: Number(v) || null })
          }
          type="number"
          suffix="回"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="回答状況"
          value={creditor.responseStatus}
          onChange={(v) =>
            updateCreditor(creditor, { responseStatus: v || null })
          }
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-2" />

      {/* 5行目: 和解日(1), 和解(1), 和解時債務金額(1), コメント(2) */}
      <div className="min-w-0 col-span-1">
        <EditableField
          label="和解日"
          value={creditor.settlementDate}
          onChange={(v) =>
            updateCreditor(creditor, { settlementDate: v || null })
          }
          type="date"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="和解"
          value={creditor.settlementAmount}
          onChange={(v) =>
            updateCreditor(creditor, { settlementAmount: Number(v) || null })
          }
          type="number"
          suffix="回"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="和解時債務金額"
          value={creditor.settlementDebtAmount}
          onChange={(v) =>
            updateCreditor(creditor, { settlementDebtAmount: Number(v) || null })
          }
          type="number"
          suffix="円"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-2">
        <EditableField
          label="コメント"
          value={creditor.settlementContentComment}
          onChange={(v) =>
            updateCreditor(creditor, { settlementContentComment: v || null })
          }
          type="textarea"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>

      {/* 支払条件 */}
      <div className="col-span-5 mt-1 border-t border-slate-100 pt-1 text-[10px] font-semibold text-slate-400">
        支払条件
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="支払開始日"
          value={creditor.paymentStartMonth}
          onChange={(v) =>
            updateCreditor(creditor, { paymentStartMonth: v || null })
          }
          type="date"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="支払回数"
          value={creditor.paymentCount}
          onChange={(v) =>
            updateCreditor(creditor, { paymentCount: Number(v) || null })
          }
          type="number"
          suffix="回"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="初回支払額"
          value={creditor.firstPaymentAmount}
          onChange={(v) =>
            updateCreditor(creditor, { firstPaymentAmount: Number(v) || null })
          }
          type="number"
          suffix="円"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
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
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="最終支払額"
          value={creditor.finalPaymentAmount}
          onChange={(v) =>
            updateCreditor(creditor, { finalPaymentAmount: Number(v) || null })
          }
          type="number"
          suffix="円"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="最終支払日"
          value={creditor.finalPaymentMonth}
          onChange={(v) =>
            updateCreditor(creditor, { finalPaymentMonth: v || null })
          }
          type="date"
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="将来利息"
          value={creditor.futureInterest}
          onChange={(v) =>
            updateCreditor(creditor, { futureInterest: v || null })
          }
          type="select"
          options={toSelectOptions(YES_NO_OPTIONS)}
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-3" />

      {/* 振込先情報 */}
      <div className="col-span-5 mt-1 border-t border-slate-100 pt-1 text-[10px] font-semibold text-slate-400">
        振込先情報
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="振込先銀行名"
          value={creditor.bankName}
          onChange={(v) => updateCreditor(creditor, { bankName: v || null })}
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="金融機関コード"
          value={creditor.financialInstitutionCode}
          onChange={(v) =>
            updateCreditor(creditor, { financialInstitutionCode: v || null })
          }
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="振込先支店名"
          value={creditor.branchName}
          onChange={(v) => updateCreditor(creditor, { branchName: v || null })}
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="支店コード"
          value={creditor.branchCode}
          onChange={(v) => updateCreditor(creditor, { branchCode: v || null })}
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="振込先口座種別"
          value={creditor.accountType}
          onChange={(v) => updateCreditor(creditor, { accountType: v || null })}
          type="select"
          options={toSelectOptions(ACCOUNT_TYPE_OPTIONS)}
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="振込先口座番号"
          value={creditor.accountNumber}
          onChange={(v) =>
            updateCreditor(creditor, { accountNumber: v || null })
          }
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="振込先口座名義"
          value={creditor.accountHolder}
          onChange={(v) =>
            updateCreditor(creditor, { accountHolder: v || null })
          }
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="指定コード"
          value={creditor.designatedCode}
          onChange={(v) =>
            updateCreditor(creditor, { designatedCode: v || null })
          }
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="弁済対象"
          value={creditor.repaymentTarget}
          onChange={(v) =>
            updateCreditor(creditor, { repaymentTarget: v || null })
          }
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-1" />

      {/* 債権者資料（ファイル格納フィールド）。No.8 */}
      {creditor.id != null && <CreditorFiles creditorId={creditor.id} />}
    </div>
  )
}
