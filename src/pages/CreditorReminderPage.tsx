/**
 * 債権者リマインド一覧。
 * 和解状況＞各社タブの「次回処理日時」を軸に、日付の古い順（昇順）で一覧表示する。
 * 各社（債権者）ごとに1行。同じ案件で複数債権者がある場合は債権者ごとに表示。
 * 表示項目はいったん和解実績一覧に準じる。
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column, StatusBadge } from '../components'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'
import { useCaseState } from '../store/useCaseStore'
import { useCreditorNames } from '../hooks/useCreditorNames'

/** サーバ(getCreditorReminders)が返す軽量な債権者行 */
type LeanCreditor = {
  id: number
  caseId: number
  creditorName: string
  status: string
  settlementDate: string | null
  settlementAmount: number | null
  nextProcessDate: string | null
}

type Row = LeanCreditor & {
  externalId: string | null
  name: string | null
  furigana: string | null
  caseStatus: string | null
}

export function CreditorReminderPage() {
  const navigate = useNavigate()
  const { cases } = useCaseState()
  // 債権者名の候補（検索モードの条件入力用・DB全体）
  const creditorNames = useCreditorNames()
  const [creditors, setCreditors] = useState<LeanCreditor[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // 次回処理日ありのみ・必要列だけを返す軽量API（全1.6万件を転送しない）
    fetch('/api/creditors/reminders')
      .then((r) => (r.ok ? (r.json() as Promise<LeanCreditor[]>) : []))
      .then((d) => {
        if (!cancelled) setCreditors(d)
      })
      .catch(() => {
        if (!cancelled) setCreditors([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 案件情報を付与（サーバ側で次回処理日昇順・フィルタ済み）。各債権者=1行。
  const rows = useMemo<Row[]>(() => {
    const caseById = new Map(cases.map((c) => [c.id, c]))
    return (creditors ?? []).map((cr) => {
      const c = caseById.get(cr.caseId)
      return {
        ...cr,
        externalId: c?.metadata.externalId ?? null,
        name: c?.clientBasicInfo.name ?? null,
        furigana: c?.clientBasicInfo.furigana ?? null,
        caseStatus: c?.settlementInfo.status ?? null,
      }
    })
  }, [creditors, cases])

  const columns: Column<Row>[] = [
    {
      key: 'nextProcessDate',
      header: '次回処理日',
      width: '108px',
      sortable: false,
      render: (r) => (
        <span className="font-semibold tabular-nums text-slate-800">
          {(r.nextProcessDate ?? '-').slice(0, 10)}
        </span>
      ),
      filterValue: (r) => (r.nextProcessDate ?? '').slice(0, 10),
    },
    { key: 'externalId', header: 'ID', width: '76px', align: 'center', render: (r) => r.externalId ?? '-', filterValue: (r) => r.externalId ?? '' },
    { key: 'name', header: '名前', width: '120px', render: (r) => <span className="whitespace-nowrap">{r.name ?? '-'}</span>, filterValue: (r) => r.name ?? '' },
    { key: 'furigana', header: 'フリガナ', width: '130px', render: (r) => r.furigana ?? '-', filterValue: (r) => r.furigana ?? '' },
    { key: 'creditorName', header: '債権者', width: '150px', cellTruncate: false, filterValue: (r) => r.creditorName ?? '', filterSuggestions: creditorNames },
    { key: 'status', header: 'ステータス', width: '110px', render: (r) => <StatusBadge status={r.status} size="sm" />, filterValue: (r) => r.status ?? '' },
    { key: 'settlementDate', header: '和解日', width: '100px', render: (r) => r.settlementDate ?? '-', filterValue: (r) => r.settlementDate ?? '' },
    {
      key: 'settlementAmount',
      header: '和解',
      width: '100px',
      align: 'right',
      render: (r) => (r.settlementAmount != null ? `${r.settlementAmount.toLocaleString()}円` : '-'),
      filterValue: (r) => (r.settlementAmount != null ? String(r.settlementAmount) : ''),
      filterNumber: (r) => r.settlementAmount,
    },
  ]

  if (loading) return <PageLoading message="債権者データを読み込み中…" />

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="債権者リマインド">
        <span className="text-xs text-slate-500">
          次回処理日の古い順・債権者ごと。{rows.length} 件
        </span>
      </AppHeader>
      <div className="p-3">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <DataTable
            data={rows}
            columns={columns}
            keyField="id"
            onRowClick={(r) => navigate(`/cases/${r.caseId}`, { state: { focusCreditorId: r.id } })}
            emptyMessage="次回処理日が設定された債権者がありません"
            density="compact"
            paginated
            stickyHeader
            enableFind
            persistKey="creditorReminder"
            csvExport="債権者リマインド一覧"
          />
        </div>
      </div>
    </div>
  )
}
