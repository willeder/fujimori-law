/**
 * 入金データ取込（銀行入出金明細 → 入金スケジュールの実入金反映）。
 * 修正依頼 No.88/90/91 対応。
 *
 * GMOあおぞらの入出金明細（バーチャル口座明細）CSV/Excel をアップロード
 *   → プレビュー（案件との突合・イレギュラールール a〜e の判定・A/B/C の反映内容）
 *   → 問題なければ「反映する」で実入金を書き込む。
 * 不足（C）の場合は不足額の補充行を自動追加する。
 */
import { useRef, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'
import { useRefreshCases } from '../store/CaseStore'

type GroupPlan = {
  date: string
  accountNumber: string | null
  payerName: string | null
  deposits: { rowNo: number; amount: number }[]
  depositSum: number
  caseId: number | null
  externalId: string | null
  clientName: string | null
  action: 'skip' | 'reflect' | 'error' | 'unmatched'
  reflectAmount: number | null
  targetPaymentId: number | null
  targetPlannedDate: string | null
  targetPlannedAmount: number | null
  pattern: 'A' | 'B' | 'C' | null
  supplementAmount: number | null
  note: string
}
type Preview = {
  encoding: string
  headerFound: boolean
  rows: number
  groups: GroupPlan[]
  errorCount: number
  unmatchedCount: number
}
type CommitResult = {
  ok: boolean
  reflected: number
  skipped: number
  errors: number
  unmatched: number
  supplements: number
}

const ACTION_LABEL: Record<GroupPlan['action'], { label: string; cls: string }> = {
  reflect: { label: '反映', cls: 'bg-emerald-100 text-emerald-800' },
  skip: { label: 'スキップ', cls: 'bg-slate-200 text-slate-600' },
  error: { label: 'エラー', cls: 'bg-red-100 text-red-700' },
  unmatched: { label: '未突合', cls: 'bg-amber-100 text-amber-800' },
}

export function DepositImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<CommitResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshCases = useRefreshCases()

  const onPick = async (file: File) => {
    setPreview(null)
    setDone(null)
    setError(null)
    setFileName(file.name)
    const buf = await file.arrayBuffer()
    setBytes(buf)
    setLoading(true)
    try {
      const r = await fetch('/api/deposits/preview', { method: 'POST', body: buf })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setPreview((await r.json()) as Preview)
    } catch (e) {
      setError(`プレビューに失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const commit = async () => {
    if (!bytes) return
    setCommitting(true)
    setError(null)
    try {
      const r = await fetch('/api/deposits/commit', { method: 'POST', body: bytes })
      const body = (await r.json()) as CommitResult
      if (!r.ok || !body.ok) {
        setError(`反映に失敗しました（HTTP ${r.status}）`)
        return
      }
      setDone(body)
      setPreview(null)
      void refreshCases()
    } catch (e) {
      setError(`反映に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCommitting(false)
    }
  }

  const reflectCount = preview?.groups.filter((g) => g.action === 'reflect').length ?? 0

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="入金取込（銀行明細 → 実入金反映）">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const input = e.target
              const f = input.files?.[0]
              if (f) void onPick(f)
              input.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (fileRef.current) fileRef.current.value = ''
              fileRef.current?.click()
            }}
            className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            ファイル選択
          </button>
          {fileName && <span className="text-xs text-slate-600">{fileName}</span>}
          <button
            type="button"
            onClick={() => void commit()}
            disabled={!preview || reflectCount === 0 || committing}
            className="ml-auto rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {committing ? '反映中…' : `反映する（${reflectCount}件）`}
          </button>
        </div>
      </AppHeader>

      <div className="p-3">
        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <PageLoading message="明細を解析中…" />
        ) : done ? (
          <div className="rounded-lg border border-emerald-200 bg-white p-4 shadow-sm text-sm">
            <p className="mb-2 font-semibold text-emerald-700">入金データを反映しました。</p>
            <ul className="list-inside list-disc space-y-0.5 text-slate-700">
              <li>実入金の反映: {done.reflected} 件（うち不足の補充行追加 {done.supplements} 件）</li>
              <li>スキップ（反映済み）: {done.skipped} 件</li>
              <li>エラー（金額相違など・未反映）: {done.errors} 件</li>
              <li>未突合（案件不明・未反映）: {done.unmatched} 件</li>
            </ul>
          </div>
        ) : !preview ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            銀行の入出金明細（バーチャル口座の振込入金明細）を CSV または Excel(.xlsx) のまま選択してください。
            <br />
            文字コード・列構成は自動判定します。バーチャル口座番号で案件と突合し、
            同一日の重複・分割入金はルール（a〜e）に沿って自動判定します。
          </div>
        ) : !preview.headerFound ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            明細のヘッダー行（取引日・入金金額 など）を検出できませんでした。ファイル形式をご確認ください。
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-slate-700">
                入金明細 <b>{preview.rows}</b> 行 → 判定 {preview.groups.length} 件
              </span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                反映 {reflectCount}
              </span>
              <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                スキップ {preview.groups.filter((g) => g.action === 'skip').length}
              </span>
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                エラー {preview.errorCount}
              </span>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                未突合 {preview.unmatchedCount}
              </span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                文字コード: {preview.encoding}
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                    <th className="px-2 py-1.5">判定</th>
                    <th className="px-2 py-1.5">入金日</th>
                    <th className="px-2 py-1.5">口座番号</th>
                    <th className="px-2 py-1.5">依頼人名</th>
                    <th className="px-2 py-1.5 text-right">明細額(合算)</th>
                    <th className="px-2 py-1.5">案件</th>
                    <th className="px-2 py-1.5 text-right">反映額</th>
                    <th className="px-2 py-1.5">反映先予定(日/額)</th>
                    <th className="px-2 py-1.5">内容</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.groups.map((g, i) => {
                    const a = ACTION_LABEL[g.action]
                    return (
                      <tr key={i} className="border-b border-slate-100 align-top">
                        <td className="px-2 py-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${a.cls}`}>
                            {a.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">{g.date}</td>
                        <td className="whitespace-nowrap px-2 py-1.5">{g.accountNumber ?? '-'}</td>
                        <td className="px-2 py-1.5">{g.payerName ?? '-'}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                          {g.depositSum.toLocaleString()}
                          {g.deposits.length > 1 && (
                            <span className="ml-1 text-[10px] text-slate-500">
                              ({g.deposits.map((d) => d.amount.toLocaleString()).join('+')})
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {g.caseId ? (
                            <a className="text-blue-600 hover:underline" href={`/cases/${g.caseId}`}>
                              {g.externalId ?? g.caseId} {g.clientName ?? ''}
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                          {g.reflectAmount != null ? g.reflectAmount.toLocaleString() : '-'}
                          {g.pattern && (
                            <span className="ml-1 text-[10px] text-slate-500">({g.pattern})</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {g.targetPlannedDate ?? '-'}
                          {g.targetPlannedAmount != null &&
                            ` / ${g.targetPlannedAmount.toLocaleString()}`}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{g.note}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
