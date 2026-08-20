/**
 * 処理予定リマインド（案件ごとの「いつ・何をする」の期日到来分）。
 *
 * kintone では和解対象債権の表に「★リマインド」という債権者の行を作り、
 * 次回処理日時と本文を書いて運用していた。債権者の行に混ざっていたため
 * 一覧で拾えず、事務員が案件を1件ずつ開いて探す形になっていた。
 * ここでは期日順に並べ、過ぎたものを赤で出して取りこぼしを防ぐ。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '../components'
import { AppHeader } from '../components/AppHeader'

type DueReminder = {
  id: number
  caseId: number
  dueDate: string | null
  body: string
  done: boolean
  source: string
  caseName: string
  externalId: string | null
  daysLeft: number | null
}

const RANGES = [
  { days: 0, label: '本日まで' },
  { days: 7, label: '7日先まで' },
  { days: 30, label: '30日先まで' },
  { days: 3650, label: 'すべて' },
]

export function ReminderTaskPage() {
  const navigate = useNavigate()
  const [within, setWithin] = useState(7)
  const [rows, setRows] = useState<DueReminder[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    return fetch(`/api/reminders/due?within=${within}`)
      .then((r) => (r.ok ? (r.json() as Promise<DueReminder[]>) : []))
      .then((d) => setRows(d))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [within])

  // 期間を切り替えたら取り直す。setLoading は effect の外（切替時）に置き、
  // effect 本体で同期的に setState しない（cascading render を避ける）
  useEffect(() => {
    void load()
  }, [load])

  const overdue = useMemo(() => rows.filter((r) => (r.daysLeft ?? 0) < 0).length, [rows])

  const markDone = async (r: DueReminder) => {
    setRows((prev) => prev.filter((x) => x.id !== r.id))
    const res = await fetch(`/api/reminders/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    }).catch(() => null)
    if (!res || !res.ok) load()
  }

  const columns: Column<DueReminder>[] = [
    {
      key: 'dueDate',
      header: '期日',
      width: '96px',
      sortable: false,
      render: (r) => (
        <span
          className={`tabular-nums ${
            (r.daysLeft ?? 0) < 0 ? 'font-bold text-red-600' : 'font-semibold text-slate-800'
          }`}
        >
          {r.dueDate ?? '-'}
        </span>
      ),
      filterValue: (r) => r.dueDate ?? '',
    },
    {
      key: 'daysLeft',
      header: '残り',
      width: '64px',
      align: 'right',
      sortable: false,
      render: (r) =>
        r.daysLeft == null ? (
          '-'
        ) : r.daysLeft < 0 ? (
          <span className="font-bold text-red-600">{-r.daysLeft}日超過</span>
        ) : r.daysLeft === 0 ? (
          <span className="font-bold text-amber-600">本日</span>
        ) : (
          <span className="text-slate-500">{r.daysLeft}日</span>
        ),
    },
    {
      key: 'externalId',
      header: 'ID',
      width: '80px',
      align: 'center',
      sortable: false,
      render: (r) => r.externalId ?? '-',
      filterValue: (r) => r.externalId ?? '',
    },
    {
      key: 'caseName',
      header: '名前',
      width: '140px',
      sortable: false,
      render: (r) => <span className="whitespace-nowrap font-medium">{r.caseName}</span>,
      filterValue: (r) => r.caseName,
    },
    {
      key: 'body',
      header: 'やること',
      sortable: false,
      cellMultiline: true,
      cellTruncate: false,
      render: (r) => <span className="whitespace-pre-wrap break-words">{r.body}</span>,
      filterValue: (r) => r.body,
    },
    {
      key: 'action',
      header: '',
      width: '64px',
      align: 'center',
      sortable: false,
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void markDone(r)
          }}
          className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-300"
          title="対応が済んだら押してください。一覧から消えます"
        >
          済
        </button>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <div className="mx-auto max-w-[1600px] space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-bold text-slate-800">処理予定リマインド</h1>
          <span className="text-xs text-slate-500">
            {loading ? '読み込み中…' : `${rows.length}件`}
            {overdue > 0 && <span className="ml-2 font-bold text-red-600">期日超過 {overdue}件</span>}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {RANGES.map((x) => (
              <button
                key={x.days}
                type="button"
                onClick={() => {
                  setLoading(true)
                  setWithin(x.days)
                }}
                className={`rounded border px-2 py-1 text-xs ${
                  within === x.days
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          data={rows}
          columns={columns}
          keyField="id"
          emptyMessage={loading ? '読み込み中…' : '期日が来ているリマインドはありません'}
          density="compact"
          stickyHeader
          onRowClick={(r) => navigate(`/cases/${r.caseId}`)}
          csvExport="処理予定リマインド"
        />
      </div>
    </div>
  )
}
