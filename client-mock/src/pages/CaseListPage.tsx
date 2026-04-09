import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCaseState } from '../store/useCaseStore'
import { DataTable, type Column, StatusBadge } from '../components'
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

  const columns: Column<Case>[] = [
    {
      key: 'id',
      header: 'No',
      width: '60px',
      align: 'center',
    },
    {
      key: 'name',
      header: '依頼者名',
      width: '120px',
      render: (item) => (
        <div>
          <div className="font-medium">{item.clientBasicInfo.name}</div>
          <div className="text-xs text-slate-400">
            {item.clientBasicInfo.furigana}
          </div>
        </div>
      ),
    },
    {
      key: 'prefecture',
      header: '都道府県',
      width: '80px',
      render: (item) => item.clientBasicInfo.prefecture,
    },
    {
      key: 'status',
      header: 'ステータス',
      width: '140px',
      render: (item) => <StatusBadge status={item.settlementInfo.status} />,
    },
    {
      key: 'creditorCount',
      header: '債権社数',
      width: '80px',
      align: 'right',
      render: (item) => (
        <span>
          {item.debtInfo.creditorCount}
          <span className="text-slate-400 text-xs ml-1">社</span>
        </span>
      ),
    },
    {
      key: 'declaredDebtAmount',
      header: '申告債務額',
      width: '120px',
      align: 'right',
      render: (item) => (
        <span>
          {item.debtInfo.declaredDebtAmount?.toLocaleString()}
          <span className="text-slate-400 text-xs ml-1">円</span>
        </span>
      ),
    },
    {
      key: 'acceptanceDate',
      header: '受任日',
      width: '100px',
      render: (item) => item.appointmentInfo.acceptanceDate,
    },
    {
      key: 'nextPaymentDate',
      header: '次回入金日',
      width: '100px',
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
      header: '担当司法書士',
      width: '100px',
      render: (item) => item.appointmentInfo.judicialScrivener,
    },
    {
      key: 'acceptanceRank',
      header: 'ランク',
      width: '60px',
      align: 'center',
      render: (item) => (
        <StatusBadge status={item.appointmentInfo.acceptanceRank} />
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-slate-200">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-slate-800">
              受任案件管理
              <span className="text-sm font-normal text-slate-500 ml-2">
                司法書士法人 第一法務事務所
              </span>
            </h1>
            <nav className="hidden md:flex items-center gap-2">
              <button
                onClick={() => navigate('/payment-management')}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                入金管理一覧
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => navigate('/settlement-results')}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                和解実績一覧
              </button>
            </nav>
          </div>
          <div className="text-sm text-slate-500">
            {cases.length}件の案件
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <select
            value={searchField}
            onChange={(e) => setSearchField(e.target.value as SearchField)}
            className="text-sm border border-slate-300 rounded px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="flex-1 max-w-md text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchValue && (
            <button
              onClick={() => setSearchValue('')}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              クリア
            </button>
          )}
          <div className="flex-1" />
          <span className="text-sm text-slate-500">
            {filteredCases.length}件表示
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="p-3">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <DataTable
            data={filteredCases}
            columns={columns}
            keyField="id"
            onRowClick={(item) => navigate(`/cases/${item.id}`)}
            emptyMessage="該当する案件がありません"
          />
        </div>
      </div>
    </div>
  )
}
