/**
 * 相談票CSV取込（新規依頼者の一括登録）。
 * 相談票Excelの「新kintone-取込」シートを書き出したCSVをアップロード
 *   → プレビュー（文字コード判定・件数・債権者・検証エラー）
 *   → 問題なければ登録（Case + Creditor を作成）。
 */
import { useMemo, useRef, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'
import { useRefreshCases } from '../store/CaseStore'

type IntakeRecord = {
  rowNo: number
  case: Record<string, unknown>
  creditors: Record<string, unknown>[]
  errors: string[]
  warnings: string[]
}
type ParseResult = {
  encoding: string
  headerFound: boolean
  records: IntakeRecord[]
  totalCreditors: number
  errorCount: number
}
type Created = { caseId: number; name: string; externalId: string | null; creditors: number }

export function IntakeImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [created, setCreated] = useState<Created[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshCases = useRefreshCases()

  const reset = () => {
    setResult(null)
    setCreated(null)
    setError(null)
  }

  const onPick = async (file: File) => {
    reset()
    setFileName(file.name)
    const buf = await file.arrayBuffer()
    setBytes(buf)
    setLoading(true)
    try {
      const r = await fetch('/api/intake/preview', { method: 'POST', body: buf })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setResult((await r.json()) as ParseResult)
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
      const r = await fetch('/api/intake/commit', { method: 'POST', body: bytes })
      const body = await r.json()
      if (!r.ok || !body.ok) {
        setError(body.error ?? `登録に失敗しました（HTTP ${r.status}）`)
        return
      }
      setCreated(body.created as Created[])
      setResult(null)
      // 取込で増えた案件を一覧/検索へ即時反映（モジュールキャッシュを差し替え）
      void refreshCases()
    } catch (e) {
      setError(`登録に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCommitting(false)
    }
  }

  const totalErrors = result?.errorCount ?? 0
  const canCommit = !!result && result.records.length > 0 && totalErrors === 0

  const v = (rec: IntakeRecord, k: string) => {
    const x = rec.case[k]
    return x == null || x === '' ? '-' : String(x).slice(0, 10)
  }

  const summary = useMemo(() => {
    if (!result) return null
    const warnCount = result.records.reduce((s, r) => s + r.warnings.length, 0)
    return { records: result.records.length, creditors: result.totalCreditors, errors: totalErrors, warnings: warnCount }
  }, [result, totalErrors])

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="相談票取込（CSV/Excel・新規依頼者の登録）">
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
              // 同じファイル名を再選択しても onChange が再発火するよう値をクリア
              input.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            ファイル選択
          </button>
          {fileName && <span className="text-xs text-slate-600">{fileName}</span>}
          <a
            href="/api/intake/template"
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            テンプレートDL
          </a>
          <button
            type="button"
            onClick={() => void commit()}
            disabled={!canCommit || committing}
            className="ml-auto rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {committing ? '登録中…' : `この内容で登録（${result?.records.length ?? 0}件）`}
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
          <PageLoading message="ファイルを解析中…" />
        ) : created ? (
          <div className="rounded-lg border border-emerald-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-emerald-700">
              {created.length} 件の依頼者を登録しました。
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-1 pr-3">案件ID</th>
                  <th className="py-1 pr-3">ID(外部)</th>
                  <th className="py-1 pr-3">依頼者名</th>
                  <th className="py-1 pr-3">債権者</th>
                </tr>
              </thead>
              <tbody>
                {created.map((c) => (
                  <tr key={c.caseId} className="border-b border-slate-100">
                    <td className="py-1 pr-3">
                      <a className="text-blue-600 hover:underline" href={`/cases/${c.caseId}`}>
                        {c.caseId}
                      </a>
                    </td>
                    <td className="py-1 pr-3">{c.externalId ?? '-'}</td>
                    <td className="py-1 pr-3">{c.name}</td>
                    <td className="py-1 pr-3">{c.creditors}件</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !result ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            相談票Excelの「新kintone-取込」シートを、CSV または Excel(.xlsx) のまま選択してください。
            <br />
            形式（CSV/Excel）と文字コード（UTF-8 / Shift-JIS）は自動判定します。フォーマットは「テンプレートDL」で確認できます。
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-slate-700">
                依頼者 <b>{summary?.records}</b> 件 / 債権者 {summary?.creditors} 件
              </span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                文字コード: {result.encoding}
              </span>
              {!result.headerFound && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  ヘッダー行を検出できず、列順で解釈しました
                </span>
              )}
              {totalErrors > 0 ? (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  エラー {totalErrors} 件（解消するまで登録不可）
                </span>
              ) : (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                  検証OK・登録できます
                </span>
              )}
            </div>

            <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-2 py-1.5">行</th>
                    <th className="px-2 py-1.5">ID</th>
                    <th className="px-2 py-1.5">依頼者名</th>
                    <th className="px-2 py-1.5">フリガナ</th>
                    <th className="px-2 py-1.5">受任日</th>
                    <th className="px-2 py-1.5">区分</th>
                    <th className="px-2 py-1.5">債権者</th>
                    <th className="px-2 py-1.5">検証</th>
                  </tr>
                </thead>
                <tbody>
                  {result.records.map((rec) => (
                    <tr
                      key={rec.rowNo}
                      className={`border-b border-slate-100 ${rec.errors.length ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-2 py-1.5 text-slate-400">{rec.rowNo}</td>
                      <td className="px-2 py-1.5">{v(rec, 'externalId')}</td>
                      <td className="px-2 py-1.5 font-medium text-slate-800">{v(rec, 'name')}</td>
                      <td className="px-2 py-1.5">{v(rec, 'furigana')}</td>
                      <td className="px-2 py-1.5">{v(rec, 'acceptanceDate')}</td>
                      <td className="px-2 py-1.5">{v(rec, 'debtAdjustmentType')}</td>
                      <td className="px-2 py-1.5">{rec.creditors.length}件</td>
                      <td className="px-2 py-1.5">
                        {rec.errors.map((e, i) => (
                          <span key={i} className="mr-1 inline-block rounded bg-red-100 px-1 text-[10px] text-red-700">
                            {e}
                          </span>
                        ))}
                        {rec.warnings.map((w, i) => (
                          <span key={i} className="mr-1 inline-block rounded bg-amber-100 px-1 text-[10px] text-amber-800">
                            {w}
                          </span>
                        ))}
                        {!rec.errors.length && !rec.warnings.length && (
                          <span className="text-[10px] text-emerald-600">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
