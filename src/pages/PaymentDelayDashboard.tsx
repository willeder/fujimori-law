import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '../components'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'
import type { DelayedCaseInfo } from '../types/case'

/**
 * 入金遅延モニタリングダッシュボード
 * 全案件の入金遅延状況を可視化し、リスクの高い案件を早期発見する。
 * 他画面とトンマナを統一（slate 配色・共有 DataTable）。
 */
type RiskLevel = 'low' | 'medium' | 'high'

type DelayRow = {
  caseId: number
  externalId: string | null
  name: string | null
  delayedPayments: number
  totalPayments: number
  consecutiveDelays: number
  delayRate: number
  avgDelayDays: number
  riskLevel: RiskLevel
  overdueCount: number
  maxOverdueDays: number
}

export function PaymentDelayDashboard() {
  const navigate = useNavigate()
  const [delayedCases, setDelayedCases] = useState<DelayedCaseInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [filterRisk, setFilterRisk] = useState<'all' | RiskLevel>('all')
  const [filterConsecutive, setFilterConsecutive] = useState<number>(0)
  const [q, setQ] = useState('')

  useEffect(() => {
    void loadDelayedCases()
  }, [])

  // 遅延/リスク案件はサーバ集計（/api/payments/delays）から取得（全 payments 転送を回避）
  async function loadDelayedCases() {
    setLoading(true)
    try {
      const res = await fetch('/api/payments/delays')
      const data = res.ok ? ((await res.json()) as DelayedCaseInfo[]) : []
      setDelayedCases(data)
    } catch {
      setDelayedCases([])
    } finally {
      setLoading(false)
    }
  }

  const filteredCases = useMemo(() => {
    const query = q.trim().toLowerCase()
    return delayedCases.filter(({ case: c, stats }) => {
      if (filterRisk !== 'all' && stats.riskLevel !== filterRisk) return false
      if (filterConsecutive > 0 && stats.consecutiveDelays < filterConsecutive) return false
      if (
        query &&
        !(
          c.clientBasicInfo.name?.toLowerCase().includes(query) ||
          c.metadata?.externalId?.toLowerCase().includes(query)
        )
      )
        return false
      return true
    })
  }, [delayedCases, filterRisk, filterConsecutive, q])

  const summary = useMemo(() => {
    return {
      consecutiveDelayCount: delayedCases.filter((d) => d.stats.consecutiveDelays >= 2).length,
      highRiskCount: delayedCases.filter((d) => d.stats.riskLevel === 'high').length,
      overdueCount: delayedCases.reduce((sum, d) => sum + d.overduePayments.length, 0),
    }
  }, [delayedCases])

  const rows = useMemo<DelayRow[]>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return filteredCases.map(({ case: c, stats, overduePayments }) => ({
      caseId: c.id,
      externalId: c.metadata?.externalId ?? null,
      name: c.clientBasicInfo.name,
      delayedPayments: stats.delayedPayments,
      totalPayments: stats.totalPayments,
      consecutiveDelays: stats.consecutiveDelays,
      delayRate: stats.delayRate,
      avgDelayDays: stats.avgDelayDays,
      riskLevel: stats.riskLevel,
      overdueCount: overduePayments.length,
      maxOverdueDays:
        overduePayments.length > 0
          ? Math.max(
              ...overduePayments.map((p) => {
                if (!p.plannedDate) return 0
                const planned = new Date(p.plannedDate)
                planned.setHours(0, 0, 0, 0)
                return Math.floor((today.getTime() - planned.getTime()) / 86_400_000)
              })
            )
          : 0,
    }))
  }, [filteredCases])

  const columns: Column<DelayRow>[] = [
    { key: 'caseId', header: 'ID', width: '76px', align: 'center', sortable: false, render: (r) => r.externalId ?? '-' },
    { key: 'name', header: '依頼者名', width: '120px', render: (r) => <span className="whitespace-nowrap">{r.name ?? '-'}</span> },
    {
      key: 'delayedPayments',
      header: '遅延回数',
      width: '84px',
      align: 'center',
      render: (r) => `${r.delayedPayments} / ${r.totalPayments}`,
    },
    {
      key: 'consecutiveDelays',
      header: '連続遅延',
      width: '76px',
      align: 'center',
      render: (r) => (
        <span
          className={
            r.consecutiveDelays >= 3
              ? 'font-semibold text-red-600'
              : r.consecutiveDelays >= 2
                ? 'font-semibold text-amber-600'
                : ''
          }
        >
          {r.consecutiveDelays}回
        </span>
      ),
    },
    {
      key: 'delayRate',
      header: '遅延率',
      width: '64px',
      align: 'right',
      render: (r) => `${(r.delayRate * 100).toFixed(1)}%`,
    },
    {
      key: 'avgDelayDays',
      header: '平均遅延',
      width: '72px',
      align: 'right',
      render: (r) => `${r.avgDelayDays}日`,
    },
    {
      key: 'riskLevel',
      header: 'リスク',
      width: '60px',
      align: 'center',
      render: (r) => <RiskBadge level={r.riskLevel} />,
    },
    {
      key: 'overdueCount',
      header: '未入金',
      width: '110px',
      align: 'right',
      render: (r) =>
        r.overdueCount > 0 ? (
          <span className="text-red-600">
            {r.overdueCount}件
            <span className="ml-1 text-[10px] text-slate-500">（最長{r.maxOverdueDays}日）</span>
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        ),
    },
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="入金遅延モニタリング">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="依頼者名・IDで検索"
            className="w-56 rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            リスク:
            <select
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value as 'all' | RiskLevel)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value="all">全て</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            連続遅延:
            <select
              value={filterConsecutive}
              onChange={(e) => setFilterConsecutive(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value="0">全て</option>
              <option value="2">2回以上</option>
              <option value="3">3回以上</option>
              <option value="5">5回以上</option>
            </select>
          </label>
          <span className="text-sm text-slate-500">
            {loading ? '集計中…' : `${rows.length} / ${delayedCases.length}件`}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void loadDelayedCases()}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            更新
          </button>
        </div>
      </AppHeader>

      <div className="p-3">
        {loading ? (
          <PageLoading message="遅延状況を集計中…" />
        ) : (
          <>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryCard label="連続遅延案件（2回以上）" count={summary.consecutiveDelayCount} accent="red" />
              <SummaryCard label="高リスク案件" count={summary.highRiskCount} accent="amber" />
              <SummaryCard label="支払期日超過（件）" count={summary.overdueCount} accent="slate" />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
              <DataTable
                data={rows}
                columns={columns}
                keyField="caseId"
                onRowClick={(r) => navigate(`/cases/${r.caseId}`)}
                emptyMessage="遅延案件はありません"
                density="compact"
                paginated
                enableFind
                persistKey="paymentDelay"
                bodyMaxHeightClassName="max-h-[calc(100vh-21rem)]"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  count,
  accent,
}: {
  label: string
  count: number
  accent: 'red' | 'amber' | 'slate'
}) {
  const accentColor = {
    red: 'text-red-600',
    amber: 'text-amber-600',
    slate: 'text-slate-700',
  }[accent]
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accentColor}`}>{count.toLocaleString()}</p>
    </div>
  )
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const meta: Record<RiskLevel, { cls: string; label: string }> = {
    low: { cls: 'bg-green-100 text-green-800', label: '低' },
    medium: { cls: 'bg-amber-100 text-amber-800', label: '中' },
    high: { cls: 'bg-red-100 text-red-800', label: '高' },
  }
  const m = meta[level]
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>
      {m.label}
    </span>
  )
}
