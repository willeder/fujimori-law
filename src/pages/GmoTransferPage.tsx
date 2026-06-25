/**
 * GMO一括振込ファイル出力（弁済代行）。
 * 対象期間を指定 → プレビュー → Shift-JIS CSV ダウンロード。
 * 既存 Excel「GMO一括振込ファイル変換マシン」の判定・整形ロジックをサーバ移植。
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '../components'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'

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
  const [ref, setRef] = useState(today)
  const [result, setResult] = useState<GmoResult | null>(null)
  const [loading, setLoading] = useState(false)

  const preview = async () => {
    setLoading(true)
    try {
      const r = await fetch(
        `/api/gmo/transfers?start=${start}&end=${end}&ref=${ref}`
      )
      setResult(r.ok ? ((await r.json()) as GmoResult) : null)
    } catch {
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const download = () => {
    window.location.href = `/api/gmo/transfers/file?start=${start}&end=${end}&ref=${ref}`
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
          <label className="flex flex-col gap-0.5 text-[10px] text-slate-500">
            基準日（当月判定）
            <input type="date" value={ref} onChange={(e) => setRef(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
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
