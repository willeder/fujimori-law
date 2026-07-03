import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column, StatusBadge } from '../components'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'
import { useCaseState } from '../store/useCaseStore'
import type { Creditor } from '../types'

type Row = {
  caseId: number
  externalId: string | null
  name: string | null
  furigana: string | null
  caseStatus: string | null
  acceptanceDate: string | null
} & Creditor

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
  const [creditors, setCreditors] = useState<Creditor[] | null>(null)
  // 債権者ドロップダウン用の候補（重複なし・軽量。ページ表示時に取得）
  const [creditorNames, setCreditorNames] = useState<string[]>([])

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
        const res = await fetch('/api/creditors')
        const data = res.ok ? ((await res.json()) as Creditor[]) : []
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
    return (creditors ?? []).map((cr) => {
      const c = cases.find((x) => x.id === cr.caseId)
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
    { key: 'caseId', header: 'ID', width: '76px', align: 'center', render: (r) => r.externalId ?? '-' },
    { key: 'name', header: '名前', width: '120px', render: (r) => <span className="whitespace-nowrap">{r.name ?? '-'}</span> },
    { key: 'furigana', header: 'フリガナ', width: '140px', render: (r) => r.furigana ?? '-' },
    {
      key: 'caseStatus',
      header: '受任後ステータス',
      width: '140px',
      render: (r) => <StatusBadge status={r.caseStatus} />,
    },
    { key: 'acceptanceDate', header: '受任日', width: '100px', render: (r) => r.acceptanceDate ?? '-' },
    { key: 'creditorName', header: '債権者', width: '140px' },
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
      render: (r) => r.settlementContentComment ?? '-',
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
          <div className="flex flex-col gap-0.5 text-[10px] text-slate-500">
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
          <label className="flex flex-col gap-0.5 text-[10px] text-slate-500">
            債権者（部分一致）
            <input
              type="text"
              value={fCreditor}
              onChange={(e) => setFCreditor(e.target.value)}
              list="settlement-creditor-names"
              placeholder="例: ポケット"
              className={`${inputCls} w-44`}
            />
            <datalist id="settlement-creditor-names">
              {creditorNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <div className="flex flex-col gap-0.5 text-[10px] text-slate-500">
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
          <div className="flex flex-col gap-0.5 text-[10px] text-slate-500">
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
          <label className="flex flex-col gap-0.5 text-[10px] text-slate-500">
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
              emptyMessage="該当する和解実績がありません"
            />
          </div>
        )}
      </div>
    </div>
  )
}
