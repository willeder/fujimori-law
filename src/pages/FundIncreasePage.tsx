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
  /** 案件の原資UP対応（すべて合算タブで選んだ値。2026-09-17 に債権者ごとから案件単位へ変更） */
  fundIncreaseState: 'required' | 'inProgress' | 'done' | 'none'
}

const REASON_LABEL: Record<Row['reason'], string> = {
  amount: '20万円以上',
  ratio: '10％以上',
  both: '20万円かつ10％以上',
}

const yen = (n: number | null) => (n != null ? `${n.toLocaleString()}円` : '-')

/** 並び順: 対応要 → 対応中 → 未判断 → 対応済（手を打つべき順） */
const FUND_ORDER: Record<Row['fundIncreaseState'], number> = {
  required: 0,
  inProgress: 1,
  none: 2,
  done: 3,
}

export function FundIncreasePage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(true)
  /*
    表示する状態の切り替え（事務所のご要望 2026-09-02、対応中は Rei 2026-09-08）。
      ・対応要 … すべて合算タブの原資UP対応が「要」の案件
      ・対応中 … 「対応中」の案件（依頼者と話している最中）
      ・未判断 … 空欄の案件（移行直後は全件ここ）
      ・対応済 … 「完了」の案件
      ※2026-09-17 までは各社タブの値からまとめていた。案件単位の1項目に変更。
    「対応要のものだけ見たい」ときは他のチェックを外す。
    未判断を既定で表示するのは、印を付ける前の案件がここにしか出てこないため
    （全部外すと、対応すべき案件を見つける入口が無くなる）。
    対応中も既定で表示する。着手済みでも終わっていない案件を見失わないように。
  */
  const [showRequired, setShowRequired] = useState(true)
  const [showInProgress, setShowInProgress] = useState(true)
  const [showNone, setShowNone] = useState(true)
  const [showDone, setShowDone] = useState(false)

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

  const all = rows ?? []
  const data = all
    .filter((r) =>
      r.fundIncreaseState === 'required'
        ? showRequired
        : r.fundIncreaseState === 'inProgress'
          ? showInProgress
          : r.fundIncreaseState === 'done'
            ? showDone
            : showNone
    )
    // 対応要 → 対応中 → 未判断 → 対応済 の順。同じ状態の中は差額の大きい順（サーバの並びのまま）。
    .sort((a, b) => FUND_ORDER[a.fundIncreaseState] - FUND_ORDER[b.fundIncreaseState])
  const count = (s: Row['fundIncreaseState']) =>
    all.filter((r) => r.fundIncreaseState === s).length

  const columns: Column<Row>[] = [
    {
      key: 'externalId',
      header: 'ID',
      width: '100px',
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
      // 案件の原資UP対応（すべて合算タブで選んだ値）。
      key: 'fundIncreaseState',
      header: '原資UP対応',
      width: '112px',
      align: 'center',
      /*
        一目で分かるように、状態ごとに色を変える（Rei 2026-09-08）。
          要=赤の塗り / 対応中=オレンジの塗り / 済=灰の文字 / 未判断=薄い灰
        「要」と「対応中」は見落とすと困るので、文字だけでなく背景も付ける。
      */
      render: (r) =>
        r.fundIncreaseState === 'required' ? (
          <span className="whitespace-nowrap rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-700">
            要
          </span>
        ) : r.fundIncreaseState === 'inProgress' ? (
          <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700">
            対応中
          </span>
        ) : r.fundIncreaseState === 'done' ? (
          <span className="whitespace-nowrap text-slate-700">済</span>
        ) : (
          <span className="text-slate-300">未判断</span>
        ),
      filterValue: (r) =>
        r.fundIncreaseState === 'required'
          ? '要'
          : r.fundIncreaseState === 'inProgress'
            ? '対応中'
            : r.fundIncreaseState === 'done'
              ? '済'
              : '未判断',
      filterSuggestions: ['要', '対応中', '済', '未判断'],
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
          申告額より実債務額が20万円以上、または申告額の10％以上大きい依頼者。
          対応要→対応中→未判断→対応済の順・{data.length} 件
        </span>
      </AppHeader>
      <div className="p-3">
        {/* 表示する状態の切り替え。既定は「対応要」と「未判断」 */}
        <div className="mb-2 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
          <span className="font-semibold text-slate-500">表示</span>
          <label className="flex cursor-pointer items-center gap-1">
            <input type="checkbox" checked={showRequired} onChange={(e) => setShowRequired(e.target.checked)} />
            <span className="font-bold text-red-600">原資UP対応要</span>
            <span className="text-slate-400">{count('required')}件</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={showInProgress}
              onChange={(e) => setShowInProgress(e.target.checked)}
            />
            <span className="font-bold text-amber-600">原資UP対応中</span>
            <span className="text-slate-400">{count('inProgress')}件</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1">
            <input type="checkbox" checked={showNone} onChange={(e) => setShowNone(e.target.checked)} />
            <span>未判断</span>
            <span className="text-slate-400">{count('none')}件</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            <span>原資UP対応済</span>
            <span className="text-slate-400">{count('done')}件</span>
          </label>
        </div>
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
