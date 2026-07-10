/**
 * 依頼者リマインド一覧。
 * 依頼者（案件）の「リマインド日」を軸に、日付の古い順（昇順）で一覧表示する。
 * 表示項目はいったん基本情報中心（入金額相違一覧に準じた識別情報）。
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column, StatusBadge } from '../components'
import { AppHeader } from '../components/AppHeader'
import { useCaseState } from '../store/useCaseStore'
import type { Case } from '../types'

export function ClientReminderPage() {
  const navigate = useNavigate()
  const { cases } = useCaseState()

  // リマインド日ありのみ、リマインド日の昇順（古い順）
  const rows = useMemo(
    () =>
      cases
        .filter((c) => !!c.reminderInfo?.reminderDate)
        .sort((a, b) =>
          (a.reminderInfo.reminderDate ?? '').localeCompare(b.reminderInfo.reminderDate ?? '')
        ),
    [cases]
  )

  const columns: Column<Case>[] = [
    {
      key: 'reminderDate',
      header: 'リマインド日',
      width: '108px',
      sortable: false,
      render: (c) => (
        <span className="font-semibold tabular-nums text-slate-800">
          {c.reminderInfo?.reminderDate ?? '-'}
        </span>
      ),
      filterValue: (c) => c.reminderInfo?.reminderDate ?? '',
    },
    {
      key: 'id',
      header: 'ID',
      width: '76px',
      align: 'center',
      sortable: false,
      render: (c) => c.metadata.externalId ?? '-',
      filterValue: (c) => c.metadata.externalId ?? '',
    },
    {
      key: 'name',
      header: '名前',
      width: '140px',
      sortable: false,
      render: (c) => <span className="whitespace-nowrap font-medium">{c.clientBasicInfo.name}</span>,
      filterValue: (c) => c.clientBasicInfo.name ?? '',
    },
    {
      key: 'furigana',
      header: 'フリガナ',
      width: '130px',
      sortable: false,
      render: (c) => c.clientBasicInfo.furigana ?? '-',
      filterValue: (c) => c.clientBasicInfo.furigana ?? '',
    },
    {
      key: 'phone',
      header: '電話番号',
      width: '120px',
      sortable: false,
      render: (c) => c.clientBasicInfo.phone ?? '-',
      filterValue: (c) => c.clientBasicInfo.phone ?? '',
    },
    {
      key: 'status',
      header: '受任後ステータス',
      width: '128px',
      sortable: false,
      render: (c) => <StatusBadge status={c.settlementInfo.status} size="sm" />,
      filterValue: (c) => c.settlementInfo.status ?? '',
    },
    {
      key: 'acceptanceDate',
      header: '受任日',
      width: '96px',
      sortable: false,
      render: (c) => c.appointmentInfo.acceptanceDate ?? '-',
      filterValue: (c) => c.appointmentInfo.acceptanceDate ?? '',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="依頼者リマインド">
        <span className="text-xs text-slate-500">
          リマインド日の古い順。{rows.length} 件
        </span>
      </AppHeader>
      <div className="p-3">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <DataTable
            data={rows}
            columns={columns}
            keyField="id"
            onRowClick={(c) => navigate(`/cases/${c.id}`)}
            emptyMessage="リマインド日が設定された依頼者がありません"
            density="compact"
            paginated
            stickyHeader
            enableFind
            persistKey="clientReminder"
            csvExport="依頼者リマインド一覧"
          />
        </div>
      </div>
    </div>
  )
}
