/**
 * 原資UP対応一覧。
 *
 * 事務所の運用（竹谷様 2026-08-21）:
 *   「申告額から20万円以上、もしくは申告額の10％以上、実債務額の方が大きい場合、
 *     原資アップの対応を行う流れになっている。対応する依頼者を早期に見つけられ、
 *     漏れも出なくなるので助かる」
 *
 * 相談時の申告額より実際の債権額が大きいと、当初の原資では返しきれない。
 * 差額の大きい順に並べ、対応の優先度が高いものから見られるようにする。
 * 判定は依頼者（案件）単位で、受任対象の債権者の合計で行う（サーバ側）。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column, StatusBadge } from '../components'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'

type Row = {
  caseId: number
  externalId: string | null
  name: string | null
  furigana: string | null
  caseStatus: string | null
  judicialScrivener: string | null
  basePaymentAmount: number | null
  creditorCount: number
  debtUnknownCount: number
  declaredAmount: number
  debtAmount: number
  /** 実債務額 − 申告額。プラスなら申告より実際の借金が多い */
  gap: number
  /** 差額 ÷ 申告額。申告額が0のときは null */
  ratio: number | null
  reason: 'amount' | 'ratio' | 'both'
}

const REASON_LABEL: Record<Row['reason'], string> = {
  amount: '20万円以上',
  ratio: '10％以上',
  both: '20万円かつ10％以上',
}

const yen = (n: number | null) => (n != null ? `${n.toLocaleString()}円` : '-')

export function FundIncreasePage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/cases/fund-increase')
      .then((r) => (r.ok ? (r.json() as Promise<Row[]>) : []))
      .then((d) => {
        if (!cancelled) setRows(d)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const data = rows ?? []

  const columns: Column<Row>[] = [
    {
      key: 'externalId',
      header: 'ID',
      width: '80px',
      align: 'center',
      render: (r) => r.externalId ?? '-',
      filterValue: (r) => r.externalId ?? '',
    },
    {
      key: 'name',
      header: '名前',
      width: '120px',
      render: (r) => <span className="whitespace-nowrap">{r.name ?? '-'}</span>,
      filterValue: (r) => r.name ?? '',
    },
    {
      key: 'furigana',
      header: 'フリガナ',
      width: '130px',
      render: (r) => r.furigana ?? '-',
      filterValue: (r) => r.furigana ?? '',
    },
    {
      key: 'gap',
      header: '差額（実債務−申告）',
      width: '140px',
      align: 'right',
      render: (r) => (
        <span className="font-bold tabular-nums text-red-600">+{r.gap.toLocaleString()}円</span>
      ),
      filterValue: (r) => String(r.gap),
      filterNumber: (r) => r.gap,
    },
    {
      key: 'ratio',
      header: '申告額比',
      width: '86px',
      align: 'right',
      render: (r) => (
        <span className="tabular-nums text-slate-700">
          {r.ratio != null ? `${(r.ratio * 100).toFixed(1)}%` : '-'}
        </span>
      ),
      filterValue: (r) => (r.ratio != null ? (r.ratio * 100).toFixed(1) : ''),
      filterNumber: (r) => r.ratio,
    },
    {
      key: 'reason',
      header: '該当条件',
      width: '132px',
      render: (r) => (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.6875rem] font-medium text-amber-800">
          {REASON_LABEL[r.reason]}
        </span>
      ),
      filterValue: (r) => REASON_LABEL[r.reason],
    },
    {
      key: 'declaredAmount',
      header: '申告額合計',
      width: '116px',
      align: 'right',
      render: (r) => <span className="tabular-nums">{yen(r.declaredAmount)}</span>,
      filterValue: (r) => String(r.declaredAmount),
      filterNumber: (r) => r.declaredAmount,
    },
    {
      key: 'debtAmount',
      header: '実債務額合計',
      width: '120px',
      align: 'right',
      render: (r) => (
        <span className="tabular-nums">
          {yen(r.debtAmount)}
          {r.debtUnknownCount > 0 && (
            <span
              className="ml-1 text-[0.6875rem] text-amber-700"
              title={`${r.debtUnknownCount}社の債権額が未入力です。実際の差額はもっと大きい可能性があります`}
            >
              （{r.debtUnknownCount}社未入力）
            </span>
          )}
        </span>
      ),
      filterValue: (r) => String(r.debtAmount),
      filterNumber: (r) => r.debtAmount,
    },
    {
      key: 'basePaymentAmount',
      header: '原資',
      width: '96px',
      align: 'right',
      render: (r) => <span className="tabular-nums">{yen(r.basePaymentAmount)}</span>,
      filterValue: (r) => (r.basePaymentAmount != null ? String(r.basePaymentAmount) : ''),
      filterNumber: (r) => r.basePaymentAmount,
    },
    {
      key: 'creditorCount',
      header: '社数',
      width: '64px',
      align: 'right',
      render: (r) => <span className="tabular-nums">{r.creditorCount}</span>,
      filterValue: (r) => String(r.creditorCount),
      filterNumber: (r) => r.creditorCount,
    },
    {
      key: 'caseStatus',
      header: 'ステータス',
      width: '150px',
      render: (r) => (r.caseStatus ? <StatusBadge status={r.caseStatus} size="sm" /> : '-'),
      filterValue: (r) => r.caseStatus ?? '',
    },
    {
      key: 'judicialScrivener',
      header: '担当司法書士',
      width: '110px',
      render: (r) => r.judicialScrivener ?? '-',
      filterValue: (r) => r.judicialScrivener ?? '',
    },
  ]

  if (loading) return <PageLoading message="原資UP対応の候補を集計中…" />

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="原資UP対応一覧">
        <span className="text-xs text-slate-500">
          申告額より実債務額が20万円以上、または申告額の10％以上大きい依頼者。差額の大きい順・
          {data.length} 件
        </span>
      </AppHeader>
      <div className="p-3">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <DataTable
            data={data}
            columns={columns}
            keyField="caseId"
            onRowClick={(r) => navigate(`/cases/${r.caseId}`)}
            emptyMessage="原資UP対応が必要な依頼者はいません"
            density="compact"
            paginated
            stickyHeader
            enableFind
            persistKey="fundIncrease"
            csvExport="原資UP対応一覧"
          />
        </div>
      </div>
    </div>
  )
}
