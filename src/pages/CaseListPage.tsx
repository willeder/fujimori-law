import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCaseState } from '../store/useCaseStore'
import { DataTable, type Column, StatusBadge } from '../components'
import { AppHeader } from '../components/AppHeader'
import { LineBroadcastModal, LineHistoryModal } from '../components/case/LineBroadcastModal'
import { SEARCH_FIELDS, type Condition } from './searchFields'
import { useSessionState } from '../hooks/useSessionState'
import {
  loadFindHistory,
  saveFindHistory,
  findHistoryLabel,
} from '../utils/findHistory'
import type { Case } from '../types'

type SearchField = 'all' | 'name' | 'phone' | 'prefecture' | 'status' | 'staff'

/**
 * 一覧の文字列セルを「空白含む n 文字まで」に切り詰める。
 * n+1 文字以上は先頭 n 文字のみ表示（…は付けない）。全文は title 属性で確認可能。
 */
function clip(s: string | null | undefined, n: number): string {
  const v = s ?? '-'
  return v.length > n ? v.slice(0, n) : v
}

export function CaseListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { cases } = useCaseState()
  // 絞り込み条件は sessionStorage に保持し、詳細から戻っても復元する
  const [searchField, setSearchField] = useSessionState<SearchField>('caseList.field', 'all')
  const [searchValue, setSearchValue] = useSessionState('caseList.value', '')
  // 詳細検索（サーバ横断検索・複数条件AND）
  const [showAdv, setShowAdv] = useSessionState('caseList.showAdv', false)
  const [conditions, setConditions] = useSessionState<Condition[]>('caseList.conditions', [
    { field: 'name', value: '' },
  ])
  const [results, setResults] = useState<Case[] | null>(null)
  const [searching, setSearching] = useState(false)

  const setCond = (i: number, patch: Partial<Condition>) =>
    setConditions((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const addCond = () => setConditions((cs) => [...cs, { field: 'name', value: '' }])
  const removeCond = (i: number) =>
    setConditions((cs) => (cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs))
  // 検索履歴（直近10件・検索モードモーダルと共有）No.147
  const [findHistory, setFindHistory] = useState<Condition[][]>(() => loadFindHistory())
  const runSearch = async (conds?: Condition[]) => {
    const active = (conds ?? conditions).filter((c) => c.value.trim())
    if (active.length === 0) {
      setResults(null)
      return
    }
    setFindHistory(saveFindHistory(active))
    setSearching(true)
    try {
      const r = await fetch('/api/cases/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions: active }),
      })
      setResults(r.ok ? ((await r.json()) as Case[]) : [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }
  const clearSearch = () => {
    setResults(null)
    setConditions([{ field: 'name', value: '' }])
  }

  // FileMaker風「検索モード」（詳細レコードでCtrl+F）から渡された条件で自動検索
  useEffect(() => {
    const st = location.state as { conditions?: Condition[] } | null
    if (st?.conditions && st.conditions.length > 0) {
      setShowAdv(true)
      setConditions(st.conditions)
      void runSearch(st.conditions)
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const filteredCases = useMemo(() => {
    if (!searchValue.trim()) return cases

    const query = searchValue.toLowerCase()
    // 入力した「文字列そのもの」が含まれるかで判定（大文字小文字のみ無視）。
    // 電話番号も数字抜き出し等の正規化はせず、ハイフン込みの文字列のまま照合する。
    // （以前は数字だけに正規化していたため「90169E」が電話番号の「90169」に化けて
    //   別案件を巻き込んでいた。その挙動を廃止。）
    const inc = (s: string | null | undefined) => (s ?? '').toLowerCase().includes(query)
    return cases.filter((c) => {
      switch (searchField) {
        case 'name':
          return inc(c.clientBasicInfo.name) || inc(c.clientBasicInfo.furigana)
        case 'phone':
          return inc(c.clientBasicInfo.phone)
        case 'prefecture':
          return inc(c.clientBasicInfo.prefecture)
        case 'status':
          return inc(c.settlementInfo.status)
        case 'staff':
          return (
            inc(c.appointmentInfo.appointmentStaff) ||
            inc(c.appointmentInfo.interviewStaff) ||
            inc(c.appointmentInfo.judicialScrivener)
          )
        default:
          return (
            inc(c.metadata?.externalId) ||
            inc(c.clientBasicInfo.name) ||
            inc(c.clientBasicInfo.furigana) ||
            inc(c.clientBasicInfo.prefecture) ||
            inc(c.settlementInfo.status) ||
            inc(c.appointmentInfo.judicialScrivener) ||
            inc(c.clientBasicInfo.phone)
          )
      }
    })
  }, [cases, searchField, searchValue])

  // 一覧は No（id）昇順で固定。ヘッダークリック等で順序を変更させない。
  const sortedCases = useMemo(() => {
    return [...filteredCases].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  }, [filteredCases])

  // 詳細検索の結果があればそれを優先表示、無ければクイック検索の結果
  const displayed = useMemo(() => {
    if (results != null) return [...results].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    return sortedCases
  }, [results, sortedCases])

  // ── LINE一斉送信: 行選択 ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const caseById = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases])
  const recipients = useMemo(
    () =>
      [...selectedIds]
        .map((id) => caseById.get(id))
        .filter((c): c is Case => !!c)
        .map((c) => ({
          id: c.id,
          name: c.clientBasicInfo.name,
          lineLinked: !!c.metadata.lineLinked,
        })),
    [selectedIds, caseById]
  )
  const toggleSel = (id: number) =>
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const allDisplayedSelected =
    displayed.length > 0 && displayed.every((c) => selectedIds.has(c.id))
  const toggleAllDisplayed = () =>
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (allDisplayedSelected) displayed.forEach((c) => n.delete(c.id))
      else displayed.forEach((c) => n.add(c.id))
      return n
    })

  const yen = (n: number | null | undefined) =>
    n != null ? (
      <span>
        {n.toLocaleString()}
        <span className="text-slate-400 text-[10px] ml-0.5">円</span>
      </span>
    ) : (
      '-'
    )

  const columns: Column<Case>[] = [
    {
      key: '_sel',
      header: '選択',
      width: '40px',
      align: 'center',
      sortable: false,
      render: (item) => (
        <input
          type="checkbox"
          checked={selectedIds.has(item.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSel(item.id)}
        />
      ),
    },
    {
      key: 'id',
      header: 'ID',
      width: '76px',
      align: 'center',
      sortable: false,
      render: (item) => item.metadata.externalId ?? '-',
      filterValue: (item) => item.metadata.externalId ?? '',
    },
    {
      key: '_line',
      header: 'LINE',
      width: '48px',
      align: 'center',
      sortable: false,
      render: (item) =>
        item.metadata.lineLinked ? (
          <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-700">済</span>
        ) : (
          <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-400">未</span>
        ),
    },
    {
      key: 'acceptanceDate',
      header: '受任日',
      width: '88px',
      sortable: false,
      render: (item) => item.appointmentInfo.acceptanceDate ?? '-',
      filterValue: (item) => item.appointmentInfo.acceptanceDate ?? '',
    },
    {
      key: 'cautionRank',
      header: '要注意',
      width: '52px',
      align: 'center',
      sortable: false,
      render: (item) => <StatusBadge status={item.clientBasicInfo.cautionRank} size="sm" />,
      filterValue: (item) => item.clientBasicInfo.cautionRank ?? '',
    },
    {
      key: 'listRegisteredDate',
      header: 'リスト登録日',
      width: '104px',
      sortable: false,
      render: (item) => item.metadata.listRegisteredDate ?? '-',
      filterValue: (item) => item.metadata.listRegisteredDate ?? '',
    },
    {
      key: 'listCategory',
      header: 'リスト区分',
      width: '116px',
      sortable: false,
      render: (item) => item.metadata.listCategory ?? '-',
      filterValue: (item) => item.metadata.listCategory ?? '',
    },
    {
      key: 'acceptanceRank',
      header: '受任ランク',
      width: '76px',
      align: 'center',
      sortable: false,
      render: (item) => <StatusBadge status={item.appointmentInfo.acceptanceRank} size="sm" />,
      filterValue: (item) => item.appointmentInfo.acceptanceRank ?? '',
    },
    {
      key: 'debtAdjustmentType',
      header: '債務整理区分',
      width: '88px',
      sortable: false,
      render: (item) => item.appointmentInfo.debtAdjustmentType ?? '-',
      filterValue: (item) => item.appointmentInfo.debtAdjustmentType ?? '',
    },
    {
      key: 'status',
      header: '受任後ステータス',
      width: '128px',
      sortable: false,
      render: (item) => <StatusBadge status={item.settlementInfo.status} size="sm" />,
      filterValue: (item) => item.settlementInfo.status ?? '',
    },
    {
      key: 'name',
      header: '名前',
      width: '148px',
      sortable: false,
      render: (item) => (
        <span className="whitespace-nowrap font-medium">{item.clientBasicInfo.name}</span>
      ),
      filterValue: (item) => item.clientBasicInfo.name ?? '',
    },
    {
      key: 'furigana',
      header: 'フリガナ',
      width: '112px',
      sortable: false,
      render: (item) => {
        const full = item.clientBasicInfo.furigana ?? '-'
        return (
          <span className="whitespace-nowrap text-slate-500" title={full}>
            {clip(item.clientBasicInfo.furigana, 8)}
          </span>
        )
      },
      filterValue: (item) => item.clientBasicInfo.furigana ?? '',
    },
    {
      key: 'phone',
      header: '電話番号',
      width: '108px',
      sortable: false,
      render: (item) => item.clientBasicInfo.phone ?? '-',
      filterValue: (item) => item.clientBasicInfo.phone ?? '',
    },
    {
      key: 'lineUrl',
      header: 'LINE@URL',
      width: '72px',
      align: 'center',
      sortable: false,
      render: (item) =>
        item.clientBasicInfo.lineUrl ? (
          <a
            href={item.clientBasicInfo.lineUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 underline"
          >
            開く
          </a>
        ) : (
          '-'
        ),
    },
    {
      key: 'creditorCount',
      header: '債権者',
      width: '52px',
      align: 'right',
      sortable: false,
      render: (item) => (
        <span>
          {item.debtInfo.creditorCount ?? '-'}
          <span className="text-slate-400 text-[10px] ml-0.5">社</span>
        </span>
      ),
      filterValue: (item) => (item.debtInfo.creditorCount != null ? String(item.debtInfo.creditorCount) : ''),
      filterNumber: (item) => item.debtInfo.creditorCount,
    },
    {
      key: 'declaredDebtAmount',
      header: '申告債務額',
      width: '104px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.debtInfo.declaredDebtAmount),
      filterValue: (item) => (item.debtInfo.declaredDebtAmount != null ? String(item.debtInfo.declaredDebtAmount) : ''),
      filterNumber: (item) => item.debtInfo.declaredDebtAmount,
    },
    {
      key: 'officeFee',
      header: '事務所報酬',
      width: '104px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.feeInfo.officeFee),
      filterValue: (item) => (item.feeInfo.officeFee != null ? String(item.feeInfo.officeFee) : ''),
      filterNumber: (item) => item.feeInfo.officeFee,
    },
    {
      key: 'appointmentStaff',
      header: 'アポ担当',
      width: '72px',
      sortable: false,
      render: (item) => (
        <span
          className="whitespace-nowrap"
          title={item.appointmentInfo.appointmentStaff ?? '-'}
        >
          {clip(item.appointmentInfo.appointmentStaff, 6)}
        </span>
      ),
      filterValue: (item) => item.appointmentInfo.appointmentStaff ?? '',
    },
    {
      key: 'interviewStaff',
      header: '面談担当',
      width: '72px',
      sortable: false,
      render: (item) => (
        <span
          className="whitespace-nowrap"
          title={item.appointmentInfo.interviewStaff ?? '-'}
        >
          {clip(item.appointmentInfo.interviewStaff, 6)}
        </span>
      ),
      filterValue: (item) => item.appointmentInfo.interviewStaff ?? '',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      <LineBroadcastModal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        recipients={recipients}
      />
      <LineHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <AppHeader title="司法書士法人 第一法務事務所">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value as SearchField)}
              disabled={results != null}
              className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
            >
              <option value="all">すべて</option>
              <option value="name">依頼者名</option>
              <option value="phone">電話番号</option>
              <option value="prefecture">都道府県</option>
              <option value="status">ステータス</option>
              <option value="staff">担当者</option>
            </select>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="クイック検索..."
              disabled={results != null}
              className="flex-1 max-w-xs text-xs border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
            />
            {searchValue && (
              <button
                onClick={() => setSearchValue('')}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                クリア
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAdv((v) => !v)}
              className={`rounded border px-2 py-1.5 text-xs font-medium ${
                showAdv || results != null
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              詳細検索 {showAdv ? '▲' : '▼'}
            </button>
            <span className="mx-1 h-4 w-px bg-slate-300" />
            <button
              type="button"
              onClick={toggleAllDisplayed}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              {allDisplayedSelected ? '選択解除' : '表示中を全選択'}
            </button>
            <button
              type="button"
              onClick={() => setBroadcastOpen(true)}
              disabled={selectedIds.size === 0}
              className="rounded bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              LINE送信{selectedIds.size > 0 ? `（${selectedIds.size}）` : ''}
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              送信履歴
            </button>
            <div className="flex-1" />
            <span className="text-xs text-slate-500">
              {results != null
                ? `${displayed.length}件（詳細検索）`
                : `${filteredCases.length} / 全${cases.length}件`}
            </span>
          </div>

          {showAdv && (
            <div className="rounded border border-slate-200 bg-slate-50 p-2">
              <div className="space-y-1.5">
                {conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <select
                      value={c.field}
                      onChange={(e) => setCond(i, { field: e.target.value })}
                      className="w-44 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {SEARCH_FIELDS.map((f) => (
                        <option key={f.field} value={f.field}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={c.value}
                      onChange={(e) => setCond(i, { value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void runSearch()
                      }}
                      placeholder="値（部分一致）"
                      className="w-56 rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeCond(i)}
                      className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="この条件を削除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={addCond}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  ＋ 条件を追加
                </button>
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={searching}
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {searching ? '検索中…' : '検索'}
                </button>
                {results != null && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    解除
                  </button>
                )}
                <span className="text-[10px] text-slate-400">
                  すべての条件に一致（AND）・部分一致（含む）。日付は「2026」「2026-05」等でも可
                </span>
              </div>
              {/* 最近の検索（直近10件・クリックで再検索）No.147 */}
              <div className="mt-2 border-t border-slate-200 pt-1.5">
                <div className="mb-1 text-[10px] font-medium text-slate-400">
                  最近の検索（直近10件・クリックで再検索）
                </div>
                {findHistory.length > 0 ? (
                  <div className="flex max-h-20 flex-wrap gap-1 overflow-auto">
                    {findHistory.map((h, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setConditions(h.map((c) => ({ ...c })))
                          void runSearch(h)
                        }}
                        title={findHistoryLabel(h)}
                        className="max-w-full truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                      >
                        {findHistoryLabel(h)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400">
                    検索を実行すると、ここに履歴が表示されます
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </AppHeader>

      {/* Table */}
      <div className="p-3">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <DataTable
            data={displayed}
            columns={columns}
            keyField="id"
            onRowClick={(item) => navigate(`/cases/${item.id}`)}
            emptyMessage="該当する案件がありません"
            density="compact"
            paginated
            stickyHeader
            enableFind
            persistKey="caseList"
          />
        </div>
      </div>
    </div>
  )
}
