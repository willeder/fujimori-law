import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCaseDispatch, usePaymentsByCaseId } from '../store/useCaseStore'
import { useFoundSet } from '../store/FoundSet'
import { useCaseEdit } from '../context/CaseEditContext'
import { settlementTotals } from '../lib/settlementTotals'
import { fundIncreaseState } from '../lib/fundIncrease'
import { EditableField, StatusBadge, DataTable, type Column } from '../components'
import { useBanks, useBranches } from '../hooks/useBankDictionary'
import type { Creditor } from '../types'
import {
  ACCOUNT_TYPE_OPTIONS,
  CREDITOR_STATUS_OPTIONS,
  FUND_INCREASE_ACTION_OPTIONS,
  REPAYMENT_TARGET_OPTIONS,
  RESPONSE_STATUS_OPTIONS,
  SETTLED_CREDITOR_STATUSES,
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
let __partnerSuggestions: string[] | null = null

/**
 * 一覧セルの金額表示。
 *
 * ここは以前 `{v?.toLocaleString() ?? '-'}{v && <span>円</span>}` と書いていたが、
 * JavaScript では 0 が falsy なため `0 && <span/>` が **0 そのもの**を返し、
 * React がそれを描画して「00」と出ていた（合算で和解金額が 0 の債権者で発生）。
 *
 * あわせて 0 は「-」で表示する。合算元の債権者は和解金額・和解時債務金額とも 0 で
 * 取り込まれており、「0円で和解した」と誤読されるのを避けるため。
 */
function renderYen(v: number | null | undefined) {
  if (v == null || v === 0) return <span className="text-slate-300">-</span>
  return (
    <span className="tabular-nums">
      {v.toLocaleString()}
      <span className="ml-0.5 text-[0.5rem] text-slate-400">円</span>
    </span>
  )
}

export function CreditorTab({ caseId, creditors, view }: CreditorTabProps) {
  const dispatch = useCaseDispatch()
  const navigate = useNavigate()
  const { setFoundSet } = useFoundSet()
  // 編集モード中は下書きに貯めるだけ（「編集完了」でまとめて保存される）
  const { stageCreditor } = useCaseEdit()
  // 弁済の進捗（合算）用。債権者別の弁済予定は表示時に生成される（creditorSchedule.ts）
  const casePayments = usePaymentsByCaseId(caseId)

  /*
    振込先の銀行名・支店名を打ちながら候補を出すための辞書（全銀協の公開データ）。
    フックは早期returnより前で呼ぶ必要があるのでここに置く。
    金融機関は一度だけ読み込み、支店は金融機関コードが決まってからその銀行のぶんだけ読む。
  */
  const { banks, byName: bankByName } = useBanks()
  const { branches, byName: branchByName } = useBranches(
    creditors[0]?.financialInstitutionCode
  )
  const bankNameSuggestions = banks.map((b) => b.name)
  const branchNameSuggestions = branches.map((b) => b.name)

  const [creditorNameSuggestions, setCreditorNameSuggestions] = useState<string[]>(
    () => __creditorNameSuggestions ?? []
  )
  const [negotiationPartnerSuggestions, setNegotiationPartnerSuggestions] = useState<string[]>(
    () => __partnerSuggestions ?? []
  )
  useEffect(() => {
    if (__creditorNameSuggestions) return
    let alive = true
    fetch('/api/creditors/names')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { names?: string[]; partners?: string[] } | null) => {
        const names = [...new Set(d?.names ?? [])]
        const partners = [...new Set(d?.partners ?? [])]
        __creditorNameSuggestions = names
        __partnerSuggestions = partners
        if (alive) {
          setCreditorNameSuggestions(names)
          setNegotiationPartnerSuggestions(partners)
        }
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
    // 案件詳細の編集モード配下では、その場で保存せず下書きへ積む
    if (stageCreditor) {
      stageCreditor(creditor, updates)
      return
    }
    // 楽観的にローカル反映
    dispatch({
      type: 'UPDATE_CREDITOR',
      payload: { ...creditor, ...updates },
    })
    // サーバへ永続化（差分判定・変更履歴/監査はサーバ側）
    if (creditor.id != null) {
      void (async () => {
        try {
          const r = await fetch(`/api/creditors/${creditor.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          })
          if (!r.ok) return
          // サーバ側で日付に連動してステータスが進むことがある。
          // 返ってきた最新行で上書きしないと、保存したのに古い表示が残る
          // （事務所から「データをいじってもその場で更新されない」とのご指摘）。
          const d = (await r.json()) as {
            row?: Creditor
            caseChanged?: boolean
          }
          if (d.row) dispatch({ type: 'UPDATE_CREDITOR', payload: d.row })
          // 案件の受任後ステータスまで変わった場合は案件側も取り直す
          if (d.caseChanged) {
            const full = await fetch(`/api/cases/${creditor.caseId}`)
              .then((res) => (res.ok ? res.json() : null))
              .catch(() => null)
            if (full) dispatch({ type: 'MERGE_FULL_CASE', payload: full })
          }
        } catch (e) {
          console.error('債権者更新の保存に失敗:', e)
        }
      })()
    }
  }

  if (view === 'summary') {
    // 合算ビュー。集計（社数・各金額）は受任対象（=「受任対象外」以外）のみで行う。
    // 受任対象外は明細テーブルには表示するが、サマリの件数・合計には含めない。
    const accepted = creditors.filter((c) => c.status !== '受任対象外')
    const settledCount = accepted.filter((c) =>
      (SETTLED_CREDITOR_STATUSES as readonly string[]).includes(c.status)
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
    // 和解状況の4項目（旧・手入力）。債権者データから機械的に出せるので画面で計算する。
    // 定義は src/lib/settlementTotals.ts を参照。
    const totals = settlementTotals(creditors)
    // 原資UP対応の案件としての状態（要 / 済 / なし）
    const fundIncrease = fundIncreaseState(creditors)

    // 弁済の進捗（合算）。個別の債権者タブ（弁済予定履歴）と同じ定義で合計する。
    //   ・和解済（和解日あり）は和解内容の金額・回数、未和解は見込み値を使う
    //   ・累計は「弁済日が入っている行」の合計。未和解は実績が立たないので 0 とする
    const progress = accepted.reduce(
      (acc, c) => {
        const isSettled = c.settlementDate != null
        const amount =
          (isSettled ? c.settlementAmount : c.expectedSettlementAmount) ?? 0
        const count = (isSettled ? c.paymentCount : c.expectedPaymentCount) ?? 0
        const paidRows = casePayments.filter(
          (p) => p.creditorId === c.id && p.actualDate != null
        )
        const paidAmount = isSettled
          ? paidRows.reduce((sum, p) => sum + (p.actualAmount ?? 0), 0)
          : 0
        const paidCount = isSettled ? paidRows.length : 0
        acc.amount += amount
        acc.paidAmount += paidAmount
        acc.remainAmount += amount - paidAmount
        acc.count += count
        acc.paidCount += paidCount
        acc.remainCount += count - paidCount
        return acc
      },
      { amount: 0, paidAmount: 0, remainAmount: 0, count: 0, paidCount: 0, remainCount: 0 }
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
        // repaymentTarget を参照する（旧 repaymentExcluded 列は未使用のため廃止）。
        key: 'repaymentTarget',
        header: '弁済対象',
        width: '80px',
        cellTruncate: false,
        render: (item) => {
          const isExcluded = item.repaymentTarget === '停止' || item.repaymentTarget === '終了'
          return (
            <select
              value={item.repaymentTarget ?? ''}
              onChange={(e) => {
                const value = e.target.value
                updateCreditor(item, {
                  repaymentTarget: value === '' ? null : value,
                })
              }}
              className={`w-full rounded border border-slate-200 px-1 py-0.5 text-xs ${
                isExcluded ? 'font-bold text-red-600' : 'text-slate-700'
              }`}
            >
              <option value="">-</option>
              {REPAYMENT_TARGET_OPTIONS.map((o) => (
                <option
                  key={o}
                  value={o}
                  className={o === '変則' ? '' : 'font-bold text-red-600'}
                >
                  {o}
                </option>
              ))}
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
        render: (item) => renderYen(item.declaredAmount),
      },
      {
        key: 'debtAmount',
        header: '債務額',
        width: '100px',
        align: 'right',
        render: (item) => renderYen(item.debtAmount),
      },
      {
        key: 'difference',
        header: '差額',
        width: '100px',
        align: 'right',
        // kintone の「差額」は 申告額 − 債務額（元データ11,727行すべてでこの式）。
        // 以前は逆向き（債務額 − 申告額）で計算していて符号が反転していた。
        render: (item) => {
          const diff = (item.declaredAmount ?? 0) - (item.debtAmount ?? 0)
          const isNegative = diff < 0
          return (
            <span className={`tabular-nums ${isNegative ? 'text-red-600' : ''}`}>
              {diff !== 0 ? diff.toLocaleString() : '-'}
              {diff !== 0 && <span className="ml-0.5 text-[0.5rem] text-slate-400">円</span>}
            </span>
          )
        },
      },
      {
        // 原資UP対応（各社タブで入れた値をそのまま出す）。
        key: 'fundIncreaseAction',
        header: '原資UP対応',
        width: '92px',
        align: 'center',
        render: (item) =>
          item.fundIncreaseAction === '要' ? (
            <span className="rounded bg-red-100 px-1 text-[0.625rem] font-bold text-red-700">要</span>
          ) : item.fundIncreaseAction === '完了' ? (
            <span className="rounded bg-slate-100 px-1 text-[0.625rem] text-slate-600">完了</span>
          ) : (
            <span className="text-slate-300">-</span>
          ),
        filterValue: (item) => item.fundIncreaseAction ?? '',
        filterSuggestions: [...FUND_INCREASE_ACTION_OPTIONS],
      },
      {
        key: 'settlementDebtAmount',
        header: '和解時債務金額',
        width: '120px',
        align: 'right',
        render: (item) => renderYen(item.settlementDebtAmount),
      },
      {
        key: 'settlementAmount',
        header: '和解金額',
        width: '110px',
        align: 'right',
        render: (item) =>
          item.settlementAmount ? (
            <span className="font-medium text-green-700 tabular-nums">
              {item.settlementAmount.toLocaleString()}
              <span className="ml-0.5 text-[0.5rem] text-slate-400">円</span>
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
        <div className="grid grid-cols-2 gap-2 rounded bg-slate-50 p-2 sm:grid-cols-5">
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
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">累計弁済額</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {progress.paidAmount.toLocaleString()}円
            </div>
          </div>
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">弁済残金額</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {progress.remainAmount.toLocaleString()}円
            </div>
          </div>
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">弁済回数（予定）</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {progress.count}回
            </div>
          </div>
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">累計弁済回数</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {progress.paidCount}回
            </div>
          </div>
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">弁済残回数</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {progress.remainCount}回
            </div>
          </div>
        </div>

        {/* 和解状況（自動計算）。kintone では手入力だった4項目を債権者から算出する */}
        <div className="grid grid-cols-2 gap-2 rounded bg-blue-50/60 p-2 sm:grid-cols-5">
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">予定代弁社数</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {totals.plannedAgentCount}社
            </div>
          </div>
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">予定弁済総数</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {totals.plannedPaymentCount}回
            </div>
          </div>
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">和解後代弁社数</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {totals.postSettlementPaymentCount}社
            </div>
          </div>
          <div>
            <div className="text-xs font-medium leading-tight text-slate-500">和解弁済総数</div>
            <div className="text-sm font-bold tabular-nums text-slate-800">
              {totals.settlementCount}回
            </div>
          </div>
          <div>
            {/* 差額合計。符号は個別債権者の「差額」と同じ 申告額 − 債務額 で揃える。
                申告より実際の債務が多い（＝聞き取りと乖離）と マイナス になる。 */}
            <div className="text-xs font-medium leading-tight text-slate-500">
              差額合計（申告−債務）
            </div>
            {/*
              原資UP対応（案件としての状態）を、差額合計の「右隣」に並べる。
              事務所からのご指摘（2026-09-03）:
                「対応が要のときに、すべて合算タブに表示する際、次の行になってますが
                  『差額の右隣』に表示できれば嬉しいです。対応要（赤太字）だけなら、
                  入らないかなと・・・」
              以前は独立した枠だったため、枠の折り返しで次の行に落ちていた。
              金額と同じ行に並べれば折り返さない。
              1社でも「要」があれば赤太字で「原資UP対応要」、
              「要」が無く「完了」があれば黒字で「原資UP対応済」。
              どちらも無い（全社空欄）ときは出さない。まとめ方は lib/fundIncrease.ts。
            */}
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span
                className={`text-sm font-bold tabular-nums ${
                  totalDeclared - totalDebt < 0 ? 'text-red-600' : 'text-slate-800'
                }`}
              >
                {(totalDeclared - totalDebt).toLocaleString()}円
              </span>
              {fundIncrease !== 'none' && (
                <span
                  className={
                    fundIncrease === 'required'
                      ? 'text-sm font-bold text-red-600'
                      : 'text-sm font-bold text-slate-800'
                  }
                >
                  {fundIncrease === 'required' ? '原資UP対応要' : '原資UP対応済'}
                </span>
              )}
            </div>
          </div>
          {totals.missingPaymentCount > 0 && (
            <div className="col-span-full text-[0.6875rem] text-amber-700">
              ※ 弁済対象 {totals.missingPaymentCount} 社は支払回数が未入力のため、
              回数の合計は実態より少なく出ています（債権者名の読み替えが済むと解消します）
            </div>
          )}
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

  // kintone の「差額」は 申告額 − 債務額
  const debtDifference = (creditor.declaredAmount ?? 0) - (creditor.debtAmount ?? 0)

  return (
    <div className="grid w-full max-w-full grid-cols-5 content-start gap-x-0.5 gap-y-0.5 self-start">
      {/* 1行目: ステータス(1), コメント(4) */}
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
      <div className="min-w-0 col-span-4">
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

      {/* 2行目: 債権者(2), 交渉相手(1), 申告額(1), 想定和解(1) */}
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
      {/* 交渉相手（kintone の「交渉先」）。債権回収会社などが窓口になる場合に入れる */}
      <div className="min-w-0 col-span-1">
        <EditableField
          label="交渉相手"
          value={creditor.negotiationPartner}
          onChange={(v) =>
            updateCreditor(creditor, { negotiationPartner: v || null })
          }
          suggestions={negotiationPartnerSuggestions}
          placeholder="直接"
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
          label="想定和解回数"
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
      {/* 3行目: 受任通知送付日(1), 債権調査到着日(1), 調査票_契約日(1), 債務額(1), 顧客コード(1) */}
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

      {/* 4行目: 差額(1), 原資UP対応(1), 和解提案日(1), 和解提案回数(1), 回答状況(1) */}
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
      {/*
        原資UP対応。差額のすぐ隣に置く（事務所のご要望 2026-09-02）。
        空欄が既定で、「要」「完了」を選ぶ。各社の値は「すべて合算」タブの
        一覧とサマリにそのまま出る。
      */}
      <div className="min-w-0 col-span-1">
        <EditableField
          label="原資UP対応"
          type="select"
          options={toSelectOptions(FUND_INCREASE_ACTION_OPTIONS)}
          value={creditor.fundIncreaseAction}
          onChange={(v) =>
            updateCreditor(creditor, { fundIncreaseAction: v || null })
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
          label="和解提案回数"
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
          type="select"
          options={toSelectOptions(RESPONSE_STATUS_OPTIONS)}
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

      {/* 5行目: 和解日(1), 和解金額(1), 和解時債務金額(1), 空(1), 次回処理日時(1) */}
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
          label="和解金額"
          value={creditor.settlementAmount}
          onChange={(v) =>
            updateCreditor(creditor, { settlementAmount: Number(v) || null })
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
      <div className="min-w-0 col-span-1" />
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

      {/* 支払条件 */}
      <div className="col-span-5 mt-1 border-t border-slate-100 pt-1 text-[0.625rem] font-semibold text-slate-400">
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
          // 実データは「なし」または利率（5 / 14.6 など）。
          // あり／なしのプルダウンでは利率を入れられないため手入力にする。
          value={creditor.futureInterest}
          onChange={(v) =>
            updateCreditor(creditor, { futureInterest: v || null })
          }
          placeholder="なし または 利率（例 14.6）"
          suffix={
            creditor.futureInterest && /^[0-9.]+$/.test(creditor.futureInterest)
              ? '％'
              : undefined
          }
          compact
          compactLayout="inline"
          bordered
          truncateValue
          fillWidth
        />
      </div>
      <div className="min-w-0 col-span-3" />

      {/* 振込先情報 */}
      <div className="col-span-5 mt-1 border-t border-slate-100 pt-1 text-[0.625rem] font-semibold text-slate-400">
        振込先情報
      </div>
      <div className="min-w-0 col-span-1">
        <EditableField
          label="振込先銀行名"
          value={creditor.bankName}
          /*
            打ちながら候補が出る（藤川様 2026-08-22「ボタンではなく直接予測が
            出る方針にしたい」）。候補から選ぶと金融機関コードも同時に入る。
            辞書に無い名前もそのまま入れられる。実データには「三菱UFJニコス」
            「三井住友カード」のように、銀行名の欄にカード会社名が入っている行が
            あるため、候補から選ぶことは強制しない。
          */
          suggestions={bankNameSuggestions}
          onChange={(v) => {
            const hit = v ? bankByName.get(v) : undefined
            updateCreditor(creditor, {
              bankName: v || null,
              // 候補から選んだときだけコードを入れる。手打ちの名前では触らない
              ...(hit ? { financialInstitutionCode: hit.code } : {}),
            })
          }}
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
          /*
            支店の候補は金融機関コードが決まってから出す。同名の支店が他行に
            大量にあるため、銀行が特定できていないと選び間違える。
            選ぶと支店コードも同時に入る。
          */
          suggestions={branchNameSuggestions}
          onChange={(v) => {
            const hit = v ? branchByName.get(v) : undefined
            updateCreditor(creditor, {
              branchName: v || null,
              ...(hit ? { branchCode: hit.code } : {}),
            })
          }}
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
          type="select"
          options={toSelectOptions(REPAYMENT_TARGET_OPTIONS)}
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

      {/*
        債権者資料（ファイル添付）は事務所のご判断で一旦出さない（2026-09-02）。
          「債権者の資料は添付は一旦いらない」
        画面から外すだけで、部品（components/case/CreditorFiles.tsx）・API・
        保存先のテーブルはそのまま残してある。実データも0件で、消えたものは無い。
        戻すときは下の1行を復活させ、上の import を戻すだけでよい。
        {creditor.id != null && <CreditorFiles creditorId={creditor.id} />}
      */}
    </div>
  )
}
