/**
 * GMO一括振込ファイル出力（弁済代行）。
 * 対象期間を指定 → プレビュー → Shift-JIS CSV ダウンロード。
 * 既存 Excel「GMO一括振込ファイル変換マシン」の判定・整形ロジックをサーバ移植。
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '../components'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'

type IncompleteRow = {
  creditorId: number
  caseId: number
  externalId: string | null
  clientName: string | null
  creditorName: string
  status: string
  settlementDate: string | null
  scheduleMissing: boolean
  accountMissing: boolean
}
type IncompleteResult = {
  rows: IncompleteRow[]
  count: number
  scheduleMissingCount: number
  accountMissingCount: number
}

type GmoRow = {
  bankCode: string
  branchCode: string
  depositType: string
  accountNumber: string
  payeeName: string
  amount: number | null
  payerName: string
  caseId: number
  externalId: string | null
  clientName: string | null
  creditorName: string
  round: '1回目' | '2回目以降'
  transferDate: string
  incomplete: boolean
}
type GmoResult = {
  periodStart: string
  periodEnd: string
  refDate: string
  rows: GmoRow[]
  count: number
  incompleteCount: number
  overLimit: boolean
}
type Row = GmoRow & { _i: number }

export function GmoTransferPage() {
  const navigate = useNavigate()
  const today = new Date().toISOString().slice(0, 10)
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [result, setResult] = useState<GmoResult | null>(null)
  const [loading, setLoading] = useState(false)

  // 当月判定の対象月（YYYY-MM）＝対象期間（開始日）の年月
  const month = start.slice(0, 7)

  // 要対応（その月に支払いが必要なのに支払条件・振込先が未入力）の検知。
  // 対象月に連動して取得する（対象期間の開始月を変えると再取得）。
  const [incomplete, setIncomplete] = useState<IncompleteResult | null>(null)
  const [showIncomplete, setShowIncomplete] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/gmo/incomplete?month=${month}`)
      .then((r) => (r.ok ? (r.json() as Promise<IncompleteResult>) : null))
      .then((d) => {
        if (!cancelled) setIncomplete(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [month])

  const incompleteColumns: Column<IncompleteRow>[] = [
    { key: 'externalId', header: 'ID', width: '72px', render: (r) => r.externalId ?? '-' },
    { key: 'clientName', header: '依頼者', width: '110px', render: (r) => r.clientName ?? '-' },
    { key: 'creditorName', header: '債権者', width: '150px' },
    { key: 'status', header: 'ステータス', width: '96px' },
    { key: 'settlementDate', header: '和解日', width: '92px', render: (r) => r.settlementDate ?? '-' },
    {
      key: 'scheduleMissing',
      header: '不足',
      width: '150px',
      render: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.scheduleMissing && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">支払条件</span>
          )}
          {r.accountMissing && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">振込先口座</span>
          )}
        </span>
      ),
    },
  ]

  const preview = async () => {
    setLoading(true)
    try {
      const r = await fetch(
        `/api/gmo/transfers?start=${start}&end=${end}`
      )
      setResult(r.ok ? ((await r.json()) as GmoResult) : null)
    } catch {
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const download = () => {
    window.location.href = `/api/gmo/transfers/file?start=${start}&end=${end}`
  }

  const rows = useMemo<Row[]>(() => {
    const base = (result?.rows ?? []).map((r, i) => ({ ...r, _i: i }))
    // 「口座情報不足」を先頭に。OK は後ろ。同状態内は元の並びを維持（安定ソート）
    return base.sort((a, b) => Number(b.incomplete) - Number(a.incomplete))
  }, [result])

  const yen = (n: number | null) => (n != null ? `${n.toLocaleString()}円` : '-')
  const columns: Column<Row>[] = [
    { key: 'externalId', header: 'ID', width: '72px', render: (r) => r.externalId ?? '-' },
    { key: 'clientName', header: '依頼者', width: '100px', render: (r) => r.clientName ?? '-' },
    { key: 'creditorName', header: '債権者', width: '150px' },
    { key: 'round', header: '回', width: '72px', align: 'center' },
    { key: 'transferDate', header: '振込日', width: '96px' },
    { key: 'bankCode', header: '銀行', width: '56px', align: 'center', render: (r) => r.bankCode || '-' },
    { key: 'branchCode', header: '支店', width: '52px', align: 'center', render: (r) => r.branchCode || '-' },
    { key: 'depositType', header: '種目', width: '48px', align: 'center', render: (r) => r.depositType || '-' },
    { key: 'accountNumber', header: '口座番号', width: '90px', render: (r) => r.accountNumber || '-' },
    { key: 'payeeName', header: '受取人名', width: '160px', render: (r) => r.payeeName || '-' },
    { key: 'amount', header: '金額', width: '96px', align: 'right', render: (r) => yen(r.amount) },
    { key: 'payerName', header: '振込依頼人名', width: '180px', render: (r) => r.payerName || '-' },
    {
      key: 'incomplete',
      header: '状態',
      width: '88px',
      align: 'center',
      render: (r) =>
        r.incomplete ? (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">口座情報不足</span>
        ) : (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">OK</span>
        ),
    },
  ]

  const outputCount = result ? result.count - result.incompleteCount : 0
  const fileCount = Math.max(1, Math.ceil(outputCount / 999))

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="GMO一括振込ファイル出力">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-[10px] text-slate-500">
            対象期間（開始）
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-slate-500">
            〜（終了）
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
          </label>
          <button
            type="button"
            onClick={() => void preview()}
            className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            プレビュー
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!result || outputCount === 0}
            className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {fileCount > 1
              ? `ZIP一括ダウンロード（${outputCount}件・${fileCount}ファイル）`
              : `CSVダウンロード（${outputCount}件）`}
          </button>
        </div>
      </AppHeader>

      <div className="p-3">
        {/* 要対応：弁済対象なのに支払条件・振込先が未入力（GMO対象から漏れる原因） */}
        {incomplete && incomplete.count > 0 && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 shadow-sm">
            <button
              type="button"
              onClick={() => setShowIncomplete((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="text-sm font-semibold text-amber-900">
                ⚠ 要対応：{month} に支払いが必要なのに支払条件・振込先が未入力{' '}
                <b className="tabular-nums">{incomplete.count}</b> 件
                <span className="ml-2 text-xs font-normal text-amber-700">
                  （支払条件不足 {incomplete.scheduleMissingCount} / 振込先不足 {incomplete.accountMissingCount}）
                </span>
              </span>
              <span className="shrink-0 text-xs text-amber-700">
                {showIncomplete ? '閉じる ▲' : '一覧を開く ▼'}
              </span>
            </button>
            {showIncomplete && (
              <div className="border-t border-amber-200 p-2">
                <p className="mb-2 px-1 text-[11px] text-amber-700">
                  これらは {month} に支払いが必要（支払開始日 ≤ {month} ≤ 最終支払日）な弁済対象なのに、金額か振込先口座が未入力のため、GMO振込の対象になりません。行をクリックすると案件詳細を開いて入力できます。※支払開始日そのものが未入力の債権者は対象月を判定できないためここには表示されません。
                </p>
                <div className="overflow-hidden rounded border border-amber-200 bg-white">
                  <DataTable
                    data={incomplete.rows}
                    columns={incompleteColumns}
                    keyField="creditorId"
                    density="compact"
                    paginated
                    onRowClick={(r) =>
                      navigate(`/cases/${r.caseId}`, {
                        state: { focusCreditorId: r.creditorId },
                      })
                    }
                    emptyMessage="未整備の弁済対象はありません"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <PageLoading message="対象を集計中…" />
        ) : !result ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            対象期間を指定して「プレビュー」してください。
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-slate-700">
                対象 <b>{result.count}</b> 件（出力 {outputCount} 件）
              </span>
              {result.incompleteCount > 0 && (
                <span className="text-red-600">口座情報不足 {result.incompleteCount} 件は出力から除外</span>
              )}
              {fileCount > 1 && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  GMOは1ファイル999件まで。{fileCount}ファイルに自動分割してZIPで一括出力します
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <DataTable
                data={rows}
                columns={columns}
                keyField="_i"
                density="compact"
                paginated
                onRowClick={(r) => navigate(`/cases/${r.caseId}`)}
                emptyMessage="対象となる振込はありません"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
