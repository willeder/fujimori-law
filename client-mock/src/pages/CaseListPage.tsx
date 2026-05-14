import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCaseState } from '../store/useCaseStore'
import { AccountNameControl, DataTable, type Column, StatusBadge, UiFontScaleControl } from '../components'
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

  const columns: Column<Case>[] = [
    {
      key: 'id',
      header: 'No',
      width: '48px',
      align: 'center',
      sortable: false,
    },
    {
      key: 'name',
      header: '依頼者名',
      width: '100px',
      sortable: false,
      render: (item) => (
        <div>
          <div className="font-medium">{item.clientBasicInfo.name}</div>
          <div className="text-[10px] text-slate-400">
            {item.clientBasicInfo.furigana}
          </div>
        </div>
      ),
    },
    {
      key: 'prefecture',
      header: '都道府県',
      width: '64px',
      sortable: false,
      render: (item) => item.clientBasicInfo.prefecture,
    },
    {
      key: 'status',
      header: 'ステータス',
      width: '120px',
      sortable: false,
      render: (item) => <StatusBadge status={item.settlementInfo.status} size="sm" />,
    },
    {
      key: 'creditorCount',
      header: '社数',
      width: '56px',
      align: 'right',
      sortable: false,
      render: (item) => (
        <span>
          {item.debtInfo.creditorCount}
          <span className="text-slate-400 text-[10px] ml-0.5">社</span>
        </span>
      ),
    },
    {
      key: 'declaredDebtAmount',
      header: '申告債務額',
      width: '100px',
      align: 'right',
      sortable: false,
      render: (item) => (
        <span>
          {item.debtInfo.declaredDebtAmount?.toLocaleString()}
          <span className="text-slate-400 text-[10px] ml-0.5">円</span>
        </span>
      ),
    },
    {
      key: 'acceptanceDate',
      header: '受任日',
      width: '88px',
      sortable: false,
      render: (item) => item.appointmentInfo.acceptanceDate,
    },
    {
      key: 'nextPaymentDate',
      header: '次回入金日',
      width: '88px',
      sortable: false,
      render: (item) => (
        <span
          className={
            item.paymentInfo.nextPaymentDate &&
            new Date(item.paymentInfo.nextPaymentDate) <= new Date()
              ? 'text-red-600 font-medium'
              : ''
          }
        >
          {item.paymentInfo.nextPaymentDate ?? '-'}
        </span>
      ),
    },
    {
      key: 'judicialScrivener',
      header: '担当',
      width: '80px',
      sortable: false,
      render: (item) => item.appointmentInfo.judicialScrivener,
    },
    {
      key: 'acceptanceRank',
      header: 'ランク',
      width: '52px',
      align: 'center',
      sortable: false,
      render: (item) => (
        <StatusBadge status={item.appointmentInfo.acceptanceRank} size="sm" />
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-slate-200">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-3 py-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-slate-800">
              受任案件管理
              <span className="text-xs font-normal text-slate-500 ml-2">
                司法書士法人 第一法務事務所
              </span>
            </h1>
            <nav className="hidden md:flex items-center gap-2">
              <button
                onClick={() => navigate('/payment-management')}
                className="text-xs text-slate-600 hover:text-slate-900"
              >
                入金管理一覧
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => navigate('/settlement-results')}
                className="text-xs text-slate-600 hover:text-slate-900"
              >
                和解実績一覧
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => navigate('/payment-discrepancy')}
                className="text-xs text-slate-600 hover:text-slate-900"
              >
                入金額相違一覧
              </button>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AccountNameControl />
            <UiFontScaleControl />
            <span className="text-xs text-slate-500">{cases.length}件の案件</span>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="bg-white border-b border-slate-200 px-3 py-2">
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
            {filteredCases.length}件表示
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="p-2">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <DataTable
            data={sortedCases}
            columns={columns}
            keyField="id"
            onRowClick={(item) => navigate(`/cases/${item.id}`)}
            emptyMessage="該当する案件がありません"
            density="compact"
            stickyHeader
          />
        </div>
      </div>
    </div>
  )
}
