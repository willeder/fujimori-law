/**
 * CSV再取込（出力したCSVを直して戻し、まとめて更新する）。
 *
 * 事務所からのご要望（2026-09-03）:
 *   「CSVファイルを修正後、再度取り込みを実施し、読み込んだファイルの値に
 *     一括で更新したい」
 *
 * 流れ:
 *   1. 案件一覧で絞り込み → CSV出力（出したい項目・テーブルを選ぶ）
 *   2. Excel などで直す（内部ID【】と［計算］の列は触らない）
 *   3. この画面でファイルを選ぶ → **何がどう変わるかを一覧で確認**
 *   4. 「取り込む」で反映。変更は1件ずつ変更履歴に残る
 *
 * 下見を必ず挟むのは、CSVは行数が多く、誤って全件を書き換えると
 * 気づくのが遅れるため。反映前に「行数・項目数・変更前→変更後」を出す。
 */
import { useRef, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { FileDropOverlay } from '../components/FileDropOverlay'
import { useFileDrop } from '../hooks/useFileDrop'
import { PageLoading } from '../components/PageLoading'
import { useRefreshCases } from '../store/CaseStore'

type EntityName = 'Case' | 'Creditor' | 'Payment' | 'ContactHistory'

type CellChange = { label: string; field: string; before: unknown; after: unknown }
type RowPlan = {
  line: number
  entity: EntityName
  entityId: number
  caseId: number
  externalId: string | null
  clientName: string | null
  hint: string | null
  changes: CellChange[]
}
type HeaderInfo = {
  index: number
  label: string
  target: { entity: EntityName; field: string } | null
  reason: string | null
}
type ImportProblem = { line: number; message: string }
type ImportPlan = {
  encoding: string
  dataRows: number
  header: HeaderInfo[]
  rows: RowPlan[]
  unchanged: number
  problems: ImportProblem[]
  counts: Record<EntityName, number>
  cells: number
  blankClears: boolean
}
type CommitResult = {
  ok: boolean
  updated: Record<EntityName, number>
  cells: number
  problems: ImportProblem[]
  error?: string
}

const ENTITY_LABEL: Record<EntityName, { label: string; cls: string }> = {
  Case: { label: '案件', cls: 'bg-slate-200 text-slate-700' },
  Creditor: { label: '債権者', cls: 'bg-indigo-100 text-indigo-800' },
  Payment: { label: '入金', cls: 'bg-emerald-100 text-emerald-800' },
  ContactHistory: { label: '接触履歴', cls: 'bg-amber-100 text-amber-800' },
}

const ACCEPT_RE = /\.(csv|xlsx|xls)$/i

const show = (v: unknown) =>
  v == null || v === '' ? <span className="text-slate-300">（空）</span> : String(v)

export function CaseCsvImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState('')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [done, setDone] = useState<CommitResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blankClears, setBlankClears] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)
  const refreshCases = useRefreshCases()

  const runPreview = async (buf: ArrayBuffer, clears: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/cases/import-csv/preview?blankClears=${clears ? '1' : '0'}`, {
        method: 'POST',
        body: buf,
      })
      const body = (await r.json()) as ImportPlan & { error?: string }
      if (!r.ok || body.error) {
        setPlan(null)
        setError(body.error ?? `読み取りに失敗しました（HTTP ${r.status}）`)
        return
      }
      setPlan(body)
    } catch (e) {
      setPlan(null)
      setError(`読み取りに失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const onPick = async (file: File) => {
    setPlan(null)
    setDone(null)
    setError(null)
    if (!ACCEPT_RE.test(file.name)) {
      setFileName('')
      setBytes(null)
      setError(`「${file.name}」は取り込めません。CSV または Excel(.xlsx / .xls) を指定してください。`)
      return
    }
    setFileName(file.name)
    const buf = await file.arrayBuffer()
    setBytes(buf)
    await runPreview(buf, blankClears)
  }

  const toggleBlankClears = async (next: boolean) => {
    setBlankClears(next)
    if (bytes) await runPreview(bytes, next)
  }

  const commit = async () => {
    if (!bytes || !plan) return
    const msg =
      `${plan.rows.length}行・${plan.cells}項目を更新します。よろしいですか？\n\n` +
      (plan.blankClears
        ? '※「空欄の項目は空にする」が入っています。CSVで空欄の項目は消えます。\n'
        : '') +
      '変更は1件ずつ変更履歴に残るので、あとから戻せます。'
    if (!window.confirm(msg)) return
    setCommitting(true)
    setError(null)
    try {
      const r = await fetch(`/api/cases/import-csv/commit?blankClears=${plan.blankClears ? '1' : '0'}`, {
        method: 'POST',
        body: bytes,
      })
      const body = (await r.json()) as CommitResult
      if (!r.ok || !body.ok) {
        setError(body.error ?? `取り込みに失敗しました（HTTP ${r.status}）`)
        return
      }
      setDone(body)
      setPlan(null)
      void refreshCases()
    } catch (e) {
      setError(`取り込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCommitting(false)
    }
  }

  const dragging = useFileDrop((files) => {
    if (files[0]) void onPick(files[0])
  }, !loading && !committing)

  const openPicker = () => {
    if (fileRef.current) fileRef.current.value = ''
    fileRef.current?.click()
  }

  const used = plan?.header.filter((h) => h.target != null) ?? []
  const skipped = plan?.header.filter((h) => h.target == null) ?? []

  return (
    <div className="relative min-h-screen bg-slate-100">
      <FileDropOverlay show={dragging} accept="CSV / Excel(.xlsx / .xls)" />

      <AppHeader title="CSV再取込（出力したCSVで一括更新）">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
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
            onClick={openPicker}
            className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            ファイル選択
          </button>
          <span className="text-xs text-slate-500">またはファイルをドラッグ&ドロップ</span>
          {fileName && <span className="text-xs font-semibold text-slate-700">{fileName}</span>}
          <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={blankClears}
              onChange={(e) => void toggleBlankClears(e.target.checked)}
              disabled={loading || committing}
            />
            空欄の項目は空にする
          </label>
          <button
            type="button"
            onClick={() => void commit()}
            disabled={!plan || plan.rows.length === 0 || committing}
            className="ml-auto rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {committing ? '取り込み中…' : `取り込む（${plan?.rows.length ?? 0}行）`}
          </button>
        </div>
      </AppHeader>

      <div className="p-3">
        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!plan && !done && !loading && <Guide />}

        {loading ? (
          <PageLoading message="ファイルを読み取り中…" />
        ) : done ? (
          <div className="rounded-lg border border-emerald-200 bg-white p-4 text-sm shadow-sm">
            <p className="mb-2 font-semibold text-emerald-700">取り込みました。</p>
            <ul className="list-inside list-disc space-y-0.5 text-slate-700">
              <li>案件: {done.updated.Case} 件</li>
              <li>債権者: {done.updated.Creditor} 件</li>
              <li>入金: {done.updated.Payment} 件</li>
              <li>接触履歴: {done.updated.ContactHistory} 件</li>
              <li>変更した項目: {done.cells} 個</li>
            </ul>
            {done.problems.length > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                取り込めなかった行が {done.problems.length} 件あります（上の一覧でご確認ください）。
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              変更内容は各案件の「変更履歴」に残っています。戻したいときはそちらから。
            </p>
          </div>
        ) : !plan ? (
          <button
            type="button"
            onClick={openPicker}
            className={`mt-3 flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center text-sm transition ${
              dragging
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                : 'border-slate-300 bg-white text-slate-500 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <span className="font-semibold">修正したCSVをここに置く</span>
            <span className="mt-1 text-xs">またはクリックしてファイルを選ぶ</span>
          </button>
        ) : (
          <div className="space-y-3">
            {/* 読み取り結果のまとめ */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <Stat label="読み取った行" value={`${plan.dataRows} 行`} />
                <Stat label="更新される行" value={`${plan.rows.length} 行`} strong />
                <Stat label="更新される項目" value={`${plan.cells} 個`} strong />
                <Stat label="変更なし" value={`${plan.unchanged} 行`} />
                <Stat
                  label="取り込めない行"
                  value={`${plan.problems.length} 件`}
                  warn={plan.problems.length > 0}
                />
                <Stat label="文字コード" value={plan.encoding} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {(Object.keys(ENTITY_LABEL) as EntityName[])
                  .filter((e) => plan.counts[e] > 0)
                  .map((e) => (
                    <span key={e} className={`rounded px-1.5 py-0.5 ${ENTITY_LABEL[e].cls}`}>
                      {ENTITY_LABEL[e].label} {plan.counts[e]} 行
                    </span>
                  ))}
              </div>
              {plan.blankClears && (
                <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  「空欄の項目は空にする」が入っています。CSVで空欄になっている項目は、
                  いま値が入っていても消えます。
                </p>
              )}
            </div>

            {/* 見出しの読み取り */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
              <div className="mb-1 font-semibold text-slate-700">
                読み取った列（{used.length} 列を更新に使います）
              </div>
              <div className="flex flex-wrap gap-1">
                {used.map((h) => (
                  <span
                    key={h.index}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700"
                  >
                    {h.label}
                  </span>
                ))}
              </div>
              {skipped.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSkipped((v) => !v)}
                    className="mt-2 text-xs text-blue-700 underline hover:text-blue-900"
                  >
                    使わない列 {skipped.length} 列を{showSkipped ? '隠す' : '見る'}
                  </button>
                  {showSkipped && (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                      {skipped.map((h) => (
                        <li key={h.index}>
                          <span className="text-slate-700">{h.label || '（空欄）'}</span>
                          <span className="ml-2">… {h.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* 取り込めない行 */}
            {plan.problems.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-white p-3 text-sm shadow-sm">
                <div className="mb-1 font-semibold text-red-700">
                  取り込めない行（{plan.problems.length} 件）
                </div>
                <ul className="max-h-56 space-y-0.5 overflow-auto text-xs text-slate-700">
                  {plan.problems.slice(0, 300).map((p, i) => (
                    <li key={i}>
                      <span className="inline-block w-20 tabular-nums text-slate-500">
                        {p.line} 行目
                      </span>
                      {p.message}
                    </li>
                  ))}
                </ul>
                {plan.problems.length > 300 && (
                  <p className="mt-1 text-xs text-slate-500">
                    …ほか {plan.problems.length - 300} 件
                  </p>
                )}
              </div>
            )}

            {/* 変更の一覧 */}
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                変更される内容（{plan.rows.length} 行）
              </div>
              {plan.rows.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">
                  変更される項目はありませんでした。CSVの値がいまのデータと同じです。
                </p>
              ) : (
                <div className="max-h-[32rem] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="w-16 px-2 py-1.5 text-left font-semibold">行</th>
                        <th className="w-20 px-2 py-1.5 text-left font-semibold">種別</th>
                        <th className="w-56 px-2 py-1.5 text-left font-semibold">対象</th>
                        <th className="px-2 py-1.5 text-left font-semibold">変更内容</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.rows.slice(0, 1000).map((r) => (
                        <tr key={`${r.entity}-${r.entityId}-${r.line}`} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-1.5 tabular-nums text-slate-500">{r.line}</td>
                          <td className="px-2 py-1.5">
                            <span className={`rounded px-1.5 py-0.5 ${ENTITY_LABEL[r.entity].cls}`}>
                              {ENTITY_LABEL[r.entity].label}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-slate-700">
                            <div className="font-semibold">{r.externalId ?? `案件${r.caseId}`}</div>
                            <div className="text-slate-500">
                              {r.clientName ?? ''}
                              {r.hint ? `／${r.hint}` : ''}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <ul className="space-y-0.5">
                              {r.changes.map((c) => (
                                <li key={c.field}>
                                  <span className="text-slate-500">{c.label}：</span>
                                  <span className="text-slate-400 line-through">{show(c.before)}</span>
                                  <span className="mx-1 text-slate-400">→</span>
                                  <span className="font-semibold text-slate-900">{show(c.after)}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.rows.length > 1000 && (
                    <p className="px-3 py-2 text-xs text-slate-500">
                      表示は先頭1,000行までです。取り込みは {plan.rows.length} 行すべてに行われます。
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  strong,
  warn,
}: {
  label: string
  value: string
  strong?: boolean
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={
          'tabular-nums ' +
          (warn ? 'font-bold text-red-700' : strong ? 'font-bold text-slate-900' : 'text-slate-700')
        }
      >
        {value}
      </span>
    </div>
  )
}

function Guide() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <div className="mb-2 font-semibold text-slate-800">CSVで一括更新する手順</div>
      <ol className="list-inside list-decimal space-y-1.5 text-slate-700">
        <li>
          案件一覧で対象を絞り込み、<b>CSV出力</b>から出したい項目・テーブルを選んで出します
          （絞り込んだ案件だけが出ます）。
        </li>
        <li>Excel などで値を直します。行の追加・削除はしないでください。</li>
        <li>この画面にファイルを置くと、<b>何がどう変わるか</b>の一覧が出ます。</li>
        <li>内容を確認して「取り込む」を押すと反映されます。</li>
      </ol>
      <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <div className="font-semibold">触らないでいただきたい列</div>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>
            <b>【案件ID】【債権者ID】【入金ID】【接触履歴ID】</b>
            … どの行のことかを決める列です。ここを直すと別の行を書き換えてしまいます。
          </li>
          <li>
            <b>［計算］</b>が付いた列（差額・累計プール・経過日数・年齢）
            … 他の値から計算して出しているので、直しても反映されません。
          </li>
        </ul>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-slate-600">
        <li>・行を足しても取り込みません（新規の追加は案件詳細から行ってください）。</li>
        <li>・空欄は既定で「変更しない」です。消したいときは上の「空欄の項目は空にする」を入れてください。</li>
        <li>・Excel で保存すると文字コードが変わることがありますが、そのまま取り込めます。</li>
        <li>・変更は1件ずつ変更履歴に残るので、あとから「このバージョンに戻す」で戻せます。</li>
      </ul>
    </div>
  )
}
