import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DelayedCaseInfo } from '../types/case'
import { mockCasesFromDocs } from '../data/mockCasesFromDocs'
import { mockPaymentRecordsFromDocs } from '../data/mockPaymentsFromDocs'
import { calculateDelayStats, detectPaymentDelays } from '../services/payment/delayDetection'

/**
 * 入金遅延モニタリングダッシュボード
 *
 * 全案件の入金遅延状況を可視化し、
 * リスクの高い案件を早期発見する
 */
export function PaymentDelayDashboard() {
  const [delayedCases, setDelayedCases] = useState<DelayedCaseInfo[]>([])
  const [filterRisk, setFilterRisk] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [filterConsecutive, setFilterConsecutive] = useState<number>(0)

  useEffect(() => {
    loadDelayedCases()
  }, [])

  function loadDelayedCases() {
    const allPayments = mockPaymentRecordsFromDocs
    const result: DelayedCaseInfo[] = []

    for (const caseData of mockCasesFromDocs) {
      // 案件ごとの入金予定を取得
      const casePayments = allPayments.filter(p => p.caseId === caseData.id)

      // 遅延統計を計算
      const stats = calculateDelayStats(caseData.id, casePayments)

      // 現在遅延中の入金を検知
      const overduePayments = detectPaymentDelays(casePayments)

      // 遅延がある、またはリスクが中以上の案件を表示
      if (overduePayments.length > 0 || stats.delayedPayments > 0 || stats.riskLevel !== 'low') {
        result.push({
          case: caseData,
          stats,
          overduePayments
        })
      }
    }

    // リスクレベル順、連続遅延回数順でソート
    result.sort((a, b) => {
      const riskOrder = { high: 3, medium: 2, low: 1 }
      const riskDiff = riskOrder[b.stats.riskLevel] - riskOrder[a.stats.riskLevel]
      if (riskDiff !== 0) return riskDiff

      return b.stats.consecutiveDelays - a.stats.consecutiveDelays
    })

    setDelayedCases(result)
  }

  // フィルタリング
  const filteredCases = useMemo(() => {
    return delayedCases.filter(({ stats }) => {
      if (filterRisk !== 'all' && stats.riskLevel !== filterRisk) return false
      if (filterConsecutive > 0 && stats.consecutiveDelays < filterConsecutive) return false
      return true
    })
  }, [delayedCases, filterRisk, filterConsecutive])

  // 統計サマリー
  const summary = useMemo(() => {
    return {
      consecutiveDelayCount: delayedCases.filter(d => d.stats.consecutiveDelays >= 2).length,
      highRiskCount: delayedCases.filter(d => d.stats.riskLevel === 'high').length,
      overdueCount: delayedCases.reduce((sum, d) => sum + d.overduePayments.length, 0)
    }
  }, [delayedCases])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* ヘッダー */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">入金遅延モニタリング</h1>
          <button
            onClick={loadDelayedCases}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            更新
          </button>
        </div>

        {/* 統計サマリー */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            title="連続遅延案件"
            count={summary.consecutiveDelayCount}
            color="red"
            icon="🔴"
          />
          <StatCard
            title="高リスク案件"
            count={summary.highRiskCount}
            color="orange"
            icon="🟡"
          />
          <StatCard
            title="支払期日超過"
            count={summary.overdueCount}
            color="yellow"
            icon="⚠️"
          />
        </div>

        {/* フィルター */}
        <div className="mb-4 flex gap-4 rounded-lg bg-white p-4 shadow">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">リスク:</label>
            <select
              value={filterRisk}
              onChange={e => setFilterRisk(e.target.value as any)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="all">全て</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">連続遅延:</label>
            <select
              value={filterConsecutive}
              onChange={e => setFilterConsecutive(Number(e.target.value))}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="0">全て</option>
              <option value="2">2回以上</option>
              <option value="3">3回以上</option>
              <option value="5">5回以上</option>
            </select>
          </div>

          <div className="ml-auto text-sm text-gray-600">
            {filteredCases.length} / {delayedCases.length} 件表示
          </div>
        </div>

        {/* 遅延案件テーブル */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  案件ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  依頼者名
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  遅延回数
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  連続遅延
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  遅延率
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  平均遅延日数
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  リスク
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  未入金
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    遅延案件はありません
                  </td>
                </tr>
              ) : (
                filteredCases.map(({ case: c, stats, overduePayments }) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <Link to={`/cases/${c.id}`} className="font-medium text-blue-600 hover:underline">
                        {c.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {c.clientBasicInfo.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {stats.delayedPayments} / {stats.totalPayments}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`font-medium ${
                          stats.consecutiveDelays >= 3
                            ? 'text-red-600'
                            : stats.consecutiveDelays >= 2
                              ? 'text-orange-600'
                              : 'text-gray-900'
                        }`}
                      >
                        {stats.consecutiveDelays}回
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(stats.delayRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {stats.avgDelayDays}日
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <RiskBadge level={stats.riskLevel} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {overduePayments.length > 0 ? (
                        <span className="text-red-600">
                          {overduePayments.length}件
                          <br />
                          <span className="text-xs">
                            (最長{Math.max(...overduePayments.map(p => {
                              if (!p.plannedDate) return 0
                              const planned = new Date(p.plannedDate)
                              const today = new Date()
                              return Math.floor((today.getTime() - planned.getTime()) / (1000 * 60 * 60 * 24))
                            }))}日)
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        to={`/cases/${c.id}`}
                        className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/**
 * 統計カード
 */
function StatCard({
  title,
  count,
  color,
  icon
}: {
  title: string
  count: number
  color: 'red' | 'orange' | 'yellow'
  icon: string
}) {
  const colorClasses = {
    red: 'bg-red-50 border-red-200',
    orange: 'bg-orange-50 border-orange-200',
    yellow: 'bg-yellow-50 border-yellow-200'
  }

  const textColorClasses = {
    red: 'text-red-900',
    orange: 'text-orange-900',
    yellow: 'text-yellow-900'
  }

  return (
    <div className={`rounded-lg border-2 ${colorClasses[color]} p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className={`mt-2 text-3xl font-bold ${textColorClasses[color]}`}>{count}</p>
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
    </div>
  )
}

/**
 * リスクバッジ
 */
function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const colors = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800'
  }

  const labels = {
    low: '低',
    medium: '中',
    high: '高'
  }

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${colors[level]}`}>
      {labels[level]}
    </span>
  )
}
