import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCaseState } from '../store/useCaseStore'
import { DataTable, type Column, StatusBadge } from '../components'
import { AppHeader } from '../components/AppHeader'
import type { Case } from '../types'

type SearchField = 'all' | 'name' | 'prefecture' | 'status' | 'staff'

export function CaseListPage() {
  const navigate = useNavigate()
  const { cases } = useCaseState()
  const [searchField, setSearchField] = useState<SearchField>('all')
  const [searchValue, setSearchValue] = useState('')

  const filteredCases = useMemo(() => {
    if (!searchValue.trim()) return cases

    const query = searchValue.toLowerCase()
    return cases.filter((c) => {
      switch (searchField) {
        case 'name':
          return c.clientBasicInfo.name?.toLowerCase().includes(query)
        case 'prefecture':
          return c.clientBasicInfo.prefecture?.toLowerCase().includes(query)
        case 'status':
          return c.settlementInfo.status?.toLowerCase().includes(query)
        case 'staff':
          return (
            c.appointmentInfo.appointmentStaff?.toLowerCase().includes(query) ||
            c.appointmentInfo.interviewStaff?.toLowerCase().includes(query) ||
            c.appointmentInfo.judicialScrivener?.toLowerCase().includes(query)
          )
        default:
          return (
            c.clientBasicInfo.name?.toLowerCase().includes(query) ||
            c.clientBasicInfo.prefecture?.toLowerCase().includes(query) ||
            c.settlementInfo.status?.toLowerCase().includes(query) ||
            c.appointmentInfo.judicialScrivener?.toLowerCase().includes(query)
          )
      }
    })
  }, [cases, searchField, searchValue])

  // 一覧は No（id）昇順で固定。ヘッダークリック等で順序を変更させない。
  const sortedCases = useMemo(() => {
    return [...filteredCases].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  }, [filteredCases])

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
    { key: 'id', header: 'ID', width: '56px', align: 'center', sortable: false },
    {
      key: 'acceptanceDate',
      header: '受任日',
      width: '88px',
      sortable: false,
      render: (item) => item.appointmentInfo.acceptanceDate ?? '-',
    },
    {
      key: 'cautionRank',
      header: '要注意ランク',
      width: '76px',
      align: 'center',
      sortable: false,
      render: (item) => <StatusBadge status={item.clientBasicInfo.cautionRank} size="sm" />,
    },
    {
      key: 'listRegisteredDate',
      header: 'リスト登録日',
      width: '92px',
      sortable: false,
      render: (item) => item.metadata.listRegisteredDate ?? '-',
    },
    {
      key: 'listCategory',
      header: 'リスト区分',
      width: '88px',
      sortable: false,
      render: (item) => item.metadata.listCategory ?? '-',
    },
    {
      key: 'acceptanceRank',
      header: '受任ランク',
      width: '76px',
      align: 'center',
      sortable: false,
      render: (item) => <StatusBadge status={item.appointmentInfo.acceptanceRank} size="sm" />,
    },
    {
      key: 'debtAdjustmentType',
      header: '債務整理区分',
      width: '88px',
      sortable: false,
      render: (item) => item.appointmentInfo.debtAdjustmentType ?? '-',
    },
    {
      key: 'status',
      header: '受任後ステータス',
      width: '128px',
      sortable: false,
      render: (item) => <StatusBadge status={item.settlementInfo.status} size="sm" />,
    },
    {
      key: 'name',
      header: '名前',
      width: '96px',
      sortable: false,
      render: (item) => <span className="font-medium">{item.clientBasicInfo.name}</span>,
    },
    {
      key: 'furigana',
      header: 'フリガナ',
      width: '104px',
      sortable: false,
      render: (item) => (
        <span className="text-slate-500">{item.clientBasicInfo.furigana ?? '-'}</span>
      ),
    },
    {
      key: 'phone',
      header: '電話番号',
      width: '108px',
      sortable: false,
      render: (item) => item.clientBasicInfo.phone ?? '-',
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
      header: '債権者数',
      width: '64px',
      align: 'right',
      sortable: false,
      render: (item) => (
        <span>
          {item.debtInfo.creditorCount ?? '-'}
          <span className="text-slate-400 text-[10px] ml-0.5">社</span>
        </span>
      ),
    },
    {
      key: 'declaredDebtAmount',
      header: '申告債務額',
      width: '104px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.debtInfo.declaredDebtAmount),
    },
    {
      key: 'officeFee',
      header: '事務所報酬',
      width: '104px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.feeInfo.officeFee),
    },
    {
      key: 'appointmentStaff',
      header: 'アポ担当',
      width: '80px',
      sortable: false,
      render: (item) => item.appointmentInfo.appointmentStaff ?? '-',
    },
    {
      key: 'interviewStaff',
      header: '面談担当',
      width: '80px',
      sortable: false,
      render: (item) => item.appointmentInfo.interviewStaff ?? '-',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="司法書士法人 第一法務事務所">
        <div className="flex items-center gap-2">
          <select
            value={searchField}
            onChange={(e) => setSearchField(e.target.value as SearchField)}
            className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">すべて</option>
            <option value="name">依頼者名</option>
            <option value="prefecture">都道府県</option>
            <option value="status">ステータス</option>
            <option value="staff">担当者</option>
          </select>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="検索..."
            className="flex-1 max-w-md text-xs border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchValue && (
            <button
              onClick={() => setSearchValue('')}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              クリア
            </button>
          )}
          <div className="flex-1" />
          <span className="text-xs text-slate-500">
            {filteredCases.length} / 全{cases.length}件
          </span>
        </div>
      </AppHeader>

      {/* Table */}
      <div className="p-3">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <DataTable
            data={sortedCases}
            columns={columns}
            keyField="id"
            onRowClick={(item) => navigate(`/cases/${item.id}`)}
            emptyMessage="該当する案件がありません"
            density="compact"
            paginated
            stickyHeader
          />
        </div>
      </div>
    </div>
  )
}
