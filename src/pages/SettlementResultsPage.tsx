import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column, StatusBadge } from '../components'
import { SuggestInput } from '../components/SuggestInput'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'
import { useCaseState } from '../store/useCaseStore'

/** サーバ(getSettlementCreditors)が返す軽量な債権者行（必要列のみ） */
type LeanCreditor = {
  id: number
  caseId: number
  creditorName: string
  status: string
  responseStatus: string | null
  settlementDate: string | null
  settlementAmount: number | null
  settlementDebtAmount: number | null
  settlementContentComment: string | null
  acceptanceNoticeSentDate: string | null
  debtAmount: number | null
}

type Row = LeanCreditor & {
  externalId: string | null
  name: string | null
  furigana: string | null
  caseStatus: string | null
  acceptanceDate: string | null
}

export function SettlementResultsPage() {
  const navigate = useNavigate()
  const { cases } = useCaseState()

  // 検索条件（受任日・和解日は期間指定: From〜To）
  const [fCreditor, setFCreditor] = useState('')
  const [fNoticeFrom, setFNoticeFrom] = useState('')
  const [fNoticeTo, setFNoticeTo] = useState('')
  const [fAccFrom, setFAccFrom] = useState('')
  const [fAccTo, setFAccTo] = useState('')
  const [fSetFrom, setFSetFrom] = useState('')
  const [fSetTo, setFSetTo] = useState('')
  const [fStatus, setFStatus] = useState('')

  // 検索が実行されるまで一覧は表示しない
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  // 債権者は全件必要。初回検索時にのみ取得（起動時・ページ表示時には読み込まない）
  const [creditors, setCreditors] = useState<LeanCreditor[] | null>(null)
  // 債権者ドロップダウン用の候補（重複なし・軽量。ページ表示時に取得）
  const [creditorNames, setCreditorNames] = useState<string[]>([])
  // 和解内容コメントの全文表示中の行ID（通常は1行省略・クリックで全文）No.110
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetch('/api/creditors/names')
      .then((r) => (r.ok ? (r.json() as Promise<{ names: string[] }>) : { names: [] }))
      .then((d) => {
        if (!cancelled) setCreditorNames(d.names)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // 受任後ステータスの選択肢（既に読み込み済みの cases サマリから導出）
  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          cases
            .map((c) => c.settlementInfo.status)
            .filter((s): s is string => !!s)
        )
      ).sort(),
    [cases]
  )

  const doSearch = async () => {
    setSearched(true)
    if (creditors === null) {
      setLoading(true)
      try {
        const res = await fetch('/api/creditors/settlement')
        const data = res.ok ? ((await res.json()) as LeanCreditor[]) : []
        setCreditors(data)
      } catch {
        setCreditors([])
      } finally {
        setLoading(false)
      }
    }
  }

  const clear = () => {
    setFCreditor('')
    setFNoticeFrom('')
    setFNoticeTo('')
    setFAccFrom('')
    setFAccTo('')
    setFSetFrom('')
    setFSetTo('')
    setFStatus('')
    setSearched(false)
  }

  /**
   * 日付（YYYY-MM-DD）が [from, to] の範囲内か判定。
   * - from/to 両方空 → 制約なし（true）
   * - from のみ → from 以降
   * - to のみ → to 以前
   * - 範囲指定があり日付が無い行は除外
   */
  const inRange = (val: string | null, from: string, to: string) => {
    if (!from && !to) return true
    const d = (val ?? '').slice(0, 10)
    if (!d) return false
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }

  const rows = useMemo<Row[]>(() => {
    // caseId→案件のMapを一度だけ作成（.find の O(n×m) を回避）
    const caseById = new Map(cases.map((c) => [c.id, c]))
    return (creditors ?? []).map((cr) => {
      const c = caseById.get(cr.caseId)
      return {
        ...cr,
        caseId: cr.caseId,
        externalId: c?.metadata.externalId ?? null,
        name: c?.clientBasicInfo.name ?? null,
        furigana: c?.clientBasicInfo.furigana ?? null,
        caseStatus: c?.settlementInfo.status ?? null,
        acceptanceDate: c?.appointmentInfo.acceptanceDate ?? null,
      }
    })
  }, [cases, creditors])

  const filtered = useMemo(() => {
    if (!searched) return []
    return rows.filter((r) => {
      if (fCreditor && !(r.creditorName ?? '').toLowerCase().includes(fCreditor.trim().toLowerCase())) return false
      if (!inRange(r.acceptanceNoticeSentDate, fNoticeFrom, fNoticeTo)) return false
      if (!inRange(r.acceptanceDate, fAccFrom, fAccTo)) return false
      if (!inRange(r.settlementDate, fSetFrom, fSetTo)) return false
      if (fStatus && r.caseStatus !== fStatus) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, rows, fCreditor, fNoticeFrom, fNoticeTo, fAccFrom, fAccTo, fSetFrom, fSetTo, fStatus])

  const columns: Column<Row>[] = [
    // 名前・フリガナ・ID は絞り込み対象から除外（filterable: false で検索モードの入力欄も出さない）No.161
    { key: 'caseId', header: 'ID', width: '96px', align: 'center', render: (r) => r.externalId ?? '-', filterable: false },
    { key: 'name', header: '名前', width: '120px', render: (r) => <span className="whitespace-nowrap">{r.name ?? '-'}</span>, filterable: false },
    { key: 'furigana', header: 'フリガナ', width: '140px', render: (r) => r.furigana ?? '-', filterable: false },
    {
      key: 'caseStatus',
      header: '受任後ステータス',
      width: '140px',
      render: (r) => <StatusBadge status={r.caseStatus} />,
    },
    { key: 'acceptanceDate', header: '受任日', width: '100px', render: (r) => r.acceptanceDate ?? '-' },
    // 検索モード（Shift+F）の条件入力にも債権者候補ドロップダウンを表示
    { key: 'creditorName', header: '債権者', width: '140px', filterSuggestions: creditorNames },
    {
      key: 'acceptanceNoticeSentDate',
      header: '受任通知送付日',
      width: '110px',
      render: (r) => r.acceptanceNoticeSentDate ?? '-',
    },
    {
      key: 'debtAmount',
      header: '債務額',
      width: '110px',
      align: 'right',
      render: (r) => (r.debtAmount != null ? `${r.debtAmount.toLocaleString()}円` : '-'),
    },
    { key: 'responseStatus', header: '回答状況', width: '110px', render: (r) => r.responseStatus ?? '-' },
    { key: 'settlementDate', header: '和解日', width: '100px', render: (r) => r.settlementDate ?? '-' },
    {
      key: 'settlementAmount',
      header: '和解',
      width: '110px',
      align: 'right',
      render: (r) => (r.settlementAmount != null ? `${r.settlementAmount.toLocaleString()}円` : '-'),
    },
    {
      key: 'settlementDebtAmount',
      header: '和解時債務金額',
      width: '130px',
      align: 'right',
      render: (r) =>
        r.settlementDebtAmount != null ? `${r.settlementDebtAmount.toLocaleString()}円` : '-',
    },
    {
      key: 'settlementContentComment',
      header: '和解内容コメント',
      width: '220px',
      // 通常は1行に省略し、セルクリックで全文表示（行クリックの詳細遷移とは分離）
      render: (r) => {
        const text = r.settlementContentComment
        if (!text) return '-'
        const expanded = expandedComments.has(r.id)
        return (
          <span
            onClick={(e) => {
              e.stopPropagation()
              setExpandedComments((prev) => {
                const next = new Set(prev)
                if (next.has(r.id)) next.delete(r.id)
                else next.add(r.id)
                return next
              })
            }}
            title={expanded ? 'クリックで折りたたむ' : 'クリックで全文表示'}
            className={`block max-w-[220px] cursor-pointer ${
              expanded ? 'whitespace-pre-wrap break-words' : 'truncate whitespace-nowrap'
            }`}
          >
            {text}
          </span>
        )
      },
    },
  ]

  const inputCls =
    'rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="和解実績一覧">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void doSearch()
          }}
          className="flex flex-wrap items-end gap-2"
        >
          {/* 検索条件の並び（左から）: 受任後ステータス → 債権者 → 受任日 → 受任通知送付日 → 和解日 */}
          <label className="flex flex-col gap-0.5 text-[0.625rem] text-slate-500">
            受任後ステータス
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className={`${inputCls} w-40`}
            >
              <option value="">すべて</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[0.625rem] text-slate-500">
            債権者（部分一致）
            <SuggestInput
              value={fCreditor}
              onValueChange={setFCreditor}
              suggestions={creditorNames}
              placeholder="クリックで一覧・入力で絞込"
              className={`${inputCls} w-44`}
            />
          </label>
          <div className="flex flex-col gap-0.5 text-[0.625rem] text-slate-500">
            受任日（期間）
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={fAccFrom}
                onChange={(e) => setFAccFrom(e.target.value)}
                className={`${inputCls} w-36`}
              />
              <span className="text-slate-400">〜</span>
              <input
                type="date"
                value={fAccTo}
                onChange={(e) => setFAccTo(e.target.value)}
                className={`${inputCls} w-36`}
              />
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-[0.625rem] text-slate-500">
            受任通知送付日（期間）
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={fNoticeFrom}
                onChange={(e) => setFNoticeFrom(e.target.value)}
                className={`${inputCls} w-36`}
              />
              <span className="text-slate-400">〜</span>
              <input
                type="date"
                value={fNoticeTo}
                onChange={(e) => setFNoticeTo(e.target.value)}
                className={`${inputCls} w-36`}
              />
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-[0.625rem] text-slate-500">
            和解日（期間）
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={fSetFrom}
                onChange={(e) => setFSetFrom(e.target.value)}
                className={`${inputCls} w-36`}
              />
              <span className="text-slate-400">〜</span>
              <input
                type="date"
                value={fSetTo}
                onChange={(e) => setFSetTo(e.target.value)}
                className={`${inputCls} w-36`}
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            検索
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            クリア
          </button>
          {searched && !loading && (
            <span className="pb-1 text-xs text-slate-500">{filtered.length}件</span>
          )}
        </form>
      </AppHeader>

      <div className="p-3">
        {!searched ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            条件を指定して「検索」してください。
          </div>
        ) : loading ? (
          <PageLoading message="債権者データを読み込み中…" />
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <DataTable
              data={filtered}
              columns={columns}
              keyField="id"
              onRowClick={(item) => navigate(`/cases/${item.caseId}`)}
              density="compact"
              paginated
              enableFind
              persistKey="settlementResults"
              csvExport="和解実績一覧"
              emptyMessage="該当する和解実績がありません"
            />
          </div>
        )}
      </div>
    </div>
  )
}
