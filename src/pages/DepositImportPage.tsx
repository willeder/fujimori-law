/**
 * 入金データ取込（銀行入出金明細 → 入金スケジュールの実入金反映）。
 * 修正依頼 No.88/90/91 対応。
 *
 * GMOあおぞらの入出金明細（バーチャル口座明細）CSV/Excel をアップロード
 *   → プレビュー（案件との突合・イレギュラールール a〜e の判定・A/B/C の反映内容）
 *   → 問題なければ「反映する」で実入金を書き込む。
 * 不足（C）の場合は不足額の補充行を自動追加する。
 *
 * ファイルは「ファイル選択」ボタンのほか、画面へのドラッグ&ドロップでも取り込める。
 * 取込ルール（a〜e・A/B/C・名義照合）は画面上に常時掲示し、担当者が変わっても
 * 判定根拠が分かるようにしている。
 */
import { useRef, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'
import { useRefreshCases } from '../store/CaseStore'

type GroupPlan = {
  date: string
  accountNumber: string | null
  branch: string | null
  payerName: string | null
  deposits: { rowNo: number; amount: number }[]
  depositSum: number
  caseId: number | null
  externalId: string | null
  clientName: string | null
  clientFurigana: string | null
  nameCheck: 'match' | 'given-only' | 'mismatch' | 'unknown'
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

/** 拡張子チェック（ドラッグ&ドロップは accept 属性が効かないため自前で判定する） */
const ACCEPT_RE = /\.(csv|xlsx|xls)$/i

/** イレギュラー入金の取込ルール（2026-05-13 定義） */
const IRREGULAR_RULES: { id: string; cond: string; result: string }[] = [
  {
    id: 'a',
    cond: '既存データと同一日で入金があり、かつ金額も既存データと同一の場合',
    result: '取り込まない',
  },
  {
    id: 'b',
    cond: '既存データと同一日で2回入金があり、かつ2回分の合算金額も既存データと同一の場合',
    result: '取り込まない',
  },
  {
    id: 'c',
    cond: '同一日で2回入金があり、かつ既存データがない場合',
    result: '1行に合算金額で反映',
  },
  {
    id: 'd',
    cond: '既存データと同一日で2回入金があり、かつ既存データで1回目が反映されている場合',
    result: '2回目の金額だけを次の行に反映',
  },
  {
    id: 'e',
    cond: '既存データと同一日で入金があり、かつ金額が既存データと相違する場合',
    result: '取込みエラーで表示',
  },
]

/** 予定額との差による充当パターン */
const ALLOCATION_PATTERNS: { id: string; cond: string; result: string }[] = [
  {
    id: 'A',
    cond: '入金額が入金予定額と同額',
    result:
      '報酬充当額・弁代報酬充当額を予定どおりにし、残り（予定していた弁済分と手数料分を含む）はプール金に積む',
  },
  {
    id: 'B',
    cond: '入金額が入金予定額より多い',
    result: '報酬・弁代報酬は予定どおりにし、超過分もあわせてプール金へ入れる',
  },
  {
    id: 'C',
    cond: '入金額が入金予定額より少ない',
    result:
      '不足分はまずプール金から取り崩し、プール残高で足りない分だけ報酬充当額を減らす（弁代報酬は必ず満額）。不足額の補充行を同じ入金予定日で1行追加する',
  },
]

/** 取込ルールの掲示。プレビュー表示中は折りたたむ */
function RuleGuide({ open }: { open: boolean }) {
  return (
    <details
      open={open}
      className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <summary className="cursor-pointer select-none bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
        取込ルール（クリックで開閉）
      </summary>

      <div className="space-y-5 px-4 py-4 text-sm text-slate-700">
        {/* 1. 使うファイル */}
        <section>
          <h3 className="mb-1 font-semibold text-slate-800">1. 取り込むファイル</h3>
          <p className="leading-relaxed">
            銀行の入出金明細（バーチャル口座の振込入金明細）を、<b>CSV または Excel(.xlsx)</b> のまま
            そのまま取り込めます。ファイルを加工する必要はありません。
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">
            <li>文字コード（Shift-JIS / UTF-8）と列の並びは自動で判定します</li>
            <li>
              <b>出金行と振込手数料の行は自動で除外</b>し、入金行だけを取り込みます
            </li>
            <li>1回の取込で複数日分をまとめて処理できます（日付ごとに判定します）</li>
          </ul>
        </section>

        {/* 2. 案件の特定 */}
        <section>
          <h3 className="mb-1 font-semibold text-slate-800">2. どの案件の入金かを特定する方法</h3>
          <p className="leading-relaxed">
            明細の「摘要」に振込依頼人名・支店名・バーチャル口座番号が続けて入っているので、
            これを3つに分解して使います。
          </p>
          <pre className="mt-1 overflow-x-auto rounded bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-700">
{`振込  タカシマ　サオリ エキデン支店 6946670
      └ 振込依頼人名 ┘ └ 支店名 ┘ └ 口座番号 ┘`}
          </pre>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">
            <li>
              <b>「支店名 ＋ 口座番号」の2つ</b>で案件を特定します。同じ口座番号が別支店にも
              存在するため、番号だけでは特定できません
            </li>
            <li>
              特定できたら<b>振込依頼人名と依頼者のフリガナを照合</b>します。他人のバーチャル口座へ
              誤って振り込まれた入金を見つけるためです
            </li>
          </ul>
          <table className="mt-2 w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="border border-slate-200 px-2 py-1">名義の照合結果</th>
                <th className="border border-slate-200 px-2 py-1">扱い</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-200 px-2 py-1">氏名が一致（旧姓・新姓も考慮）</td>
                <td className="border border-slate-200 px-2 py-1">そのまま反映します</td>
              </tr>
              <tr>
                <td className="border border-slate-200 px-2 py-1">
                  下の名前だけ一致（姓が違う）
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  ご家族などの代理振込とみなして反映し、内容欄に注意書きを付けます
                </td>
              </tr>
              <tr>
                <td className="border border-slate-200 px-2 py-1">一致しない</td>
                <td className="border border-slate-200 px-2 py-1">
                  <b className="text-red-700">誤振込の疑いとして反映せず</b>、エラーに表示します。
                  内容を確認して手入力してください
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 3. a〜e */}
        <section>
          <h3 className="mb-1 font-semibold text-slate-800">
            3. 同じ日に入金が重なったときの判定（ルール a〜e）
          </h3>
          <p className="mb-1 leading-relaxed text-slate-600">
            イレギュラーな入金を少しでも自動で想定どおりに反映するため、下記のルールを設定しています。
            「既存データ」とは、すでにアプリに登録されている同じ日の実入金のことです。
          </p>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="w-8 border border-slate-200 px-2 py-1">#</th>
                <th className="border border-slate-200 px-2 py-1">こういうとき</th>
                <th className="w-64 border border-slate-200 px-2 py-1">こうする</th>
              </tr>
            </thead>
            <tbody>
              {IRREGULAR_RULES.map((r) => (
                <tr key={r.id}>
                  <td className="border border-slate-200 px-2 py-1 text-center font-semibold">
                    {r.id}
                  </td>
                  <td className="border border-slate-200 px-2 py-1">{r.cond}</td>
                  <td className="border border-slate-200 px-2 py-1">{r.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 4. A/B/C */}
        <section>
          <h3 className="mb-1 font-semibold text-slate-800">
            4. 入金予定額との差による充当のしかた（パターン A / B / C）
          </h3>
          <p className="mb-1 leading-relaxed text-slate-600">
            反映先は、その案件で<b>まだ入金がない最も古い入金予定行</b>です。
            プレビューの「反映額」欄に、どのパターンで計算したかを (A)(B)(C) で表示します。
          </p>
          <p className="mb-1 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 leading-relaxed text-amber-900">
            <b>入金の時点で充当するのは「報酬」と「弁代報酬」だけ</b>です。
            弁済充当額・振)手数料・社数（実績）は、実際に債権者へ振り込んだ時点で計上するもので、
            それまでの原資はプール金に残ります。
            そのため、どのパターンでも「実入金額 ＝ 報酬 ＋ 弁代報酬 ＋ プール」になります。
          </p>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="w-8 border border-slate-200 px-2 py-1">#</th>
                <th className="w-48 border border-slate-200 px-2 py-1">こういうとき</th>
                <th className="border border-slate-200 px-2 py-1">こうする</th>
              </tr>
            </thead>
            <tbody>
              {ALLOCATION_PATTERNS.map((r) => (
                <tr key={r.id}>
                  <td className="border border-slate-200 px-2 py-1 text-center font-semibold">
                    {r.id}
                  </td>
                  <td className="border border-slate-200 px-2 py-1">{r.cond}</td>
                  <td className="border border-slate-200 px-2 py-1">{r.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 5. 判定バッジ */}
        <section>
          <h3 className="mb-1 font-semibold text-slate-800">5. プレビューの「判定」の見かた</h3>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="w-24 border border-slate-200 px-2 py-1">判定</th>
                <th className="border border-slate-200 px-2 py-1">意味とやること</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-200 px-2 py-1">
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                    反映
                  </span>
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  「反映する」を押すと実入金として書き込まれます
                </td>
              </tr>
              <tr>
                <td className="border border-slate-200 px-2 py-1">
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                    スキップ
                  </span>
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  すでに反映済み（ルール a / b）。同じファイルを二重に取り込んでも増えません
                </td>
              </tr>
              <tr>
                <td className="border border-slate-200 px-2 py-1">
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                    エラー
                  </span>
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  金額が既存データと相違（ルール e）／名義が一致しない／反映先の入金予定行がない。
                  <b>反映されません。</b>内容欄を読んで手作業で対応してください
                </td>
              </tr>
              <tr>
                <td className="border border-slate-200 px-2 py-1">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                    未突合
                  </span>
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  該当する案件が見つからない（未登録の依頼者・バーチャル口座を経由しない振込など）。
                  <b>反映されません。</b>案件を特定して手入力してください
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 leading-relaxed text-slate-600">
            エラー・未突合があっても、<b>「反映」の行だけを取り込むことができます。</b>
            残った行を手当てしてから、同じファイルをもう一度取り込んでも二重計上にはなりません。
          </p>
        </section>
      </div>
    </details>
  )
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
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0) // 子要素をまたぐ dragleave で解除されないよう深さを数える
  const refreshCases = useRefreshCases()

  const onPick = async (file: File) => {
    setPreview(null)
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

  // ---- ドラッグ&ドロップ（画面のどこに落としても受け付ける） ----
  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (loading || committing) return
    const f = e.dataTransfer.files?.[0]
    if (f) void onPick(f)
  }

  const openPicker = () => {
    if (fileRef.current) fileRef.current.value = ''
    fileRef.current?.click()
  }

  const reflectCount = preview?.groups.filter((g) => g.action === 'reflect').length ?? 0

  return (
    <div
      className="relative min-h-screen bg-slate-100"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* ドラッグ中の全面オーバーレイ */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="rounded-2xl border-4 border-dashed border-white bg-slate-900/70 px-10 py-8 text-center text-white">
            <p className="text-lg font-bold">ここにドロップして取り込む</p>
            <p className="mt-1 text-sm opacity-90">CSV / Excel(.xlsx / .xls)</p>
          </div>
        </div>
      )}

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
            onClick={openPicker}
            className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            ファイル選択
          </button>
          <span className="text-xs text-slate-500">またはファイルをドラッグ&ドロップ</span>
          {fileName && <span className="text-xs font-semibold text-slate-700">{fileName}</span>}
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

        {/* 取込ルールの掲示。ファイル未選択のときは開いた状態で出す */}
        <RuleGuide open={!preview && !done && !loading} />

        {loading ? (
          <PageLoading message="明細を解析中…" />
        ) : done ? (
          <div className="rounded-lg border border-emerald-200 bg-white p-4 shadow-sm text-sm">
            <p className="mb-2 font-semibold text-emerald-700">入金データを反映しました。</p>
            <ul className="list-inside list-disc space-y-0.5 text-slate-700">
              <li>実入金の反映: {done.reflected} 件（うち不足の補充行追加 {done.supplements} 件）</li>
              <li>スキップ（反映済み）: {done.skipped} 件</li>
              <li>エラー（金額相違・名義不一致など・未反映）: {done.errors} 件</li>
              <li>未突合（案件不明・未反映）: {done.unmatched} 件</li>
            </ul>
          </div>
        ) : !preview ? (
          <button
            type="button"
            onClick={openPicker}
            className={`flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center text-sm transition ${
              dragging
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                : 'border-slate-300 bg-white text-slate-500 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <svg
              className="mb-3 h-10 w-10 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 7.5L12 3m0 0L7.5 7.5M12 3v13.5"
              />
            </svg>
            <span className="text-base font-semibold text-slate-700">
              ここにファイルをドラッグ&ドロップ
            </span>
            <span className="mt-1 text-slate-500">またはクリックしてファイルを選択</span>
            <span className="mt-3 max-w-xl leading-relaxed text-xs text-slate-500">
              銀行の入出金明細（バーチャル口座の振込入金明細）を CSV または Excel(.xlsx) のまま
              取り込めます。文字コード・列構成は自動判定します。上の「取込ルール」に判定の詳細を
              記載しています。
            </span>
          </button>
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
                    <th className="px-2 py-1.5">支店</th>
                    <th className="px-2 py-1.5">口座番号</th>
                    <th className="px-2 py-1.5">振込依頼人名</th>
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
                        <td className="whitespace-nowrap px-2 py-1.5">{g.branch ?? '-'}</td>
                        <td className="whitespace-nowrap px-2 py-1.5">{g.accountNumber ?? '-'}</td>
                        <td className="px-2 py-1.5">
                          {g.payerName ?? '-'}
                          {g.nameCheck === 'given-only' && (
                            <span className="ml-1 rounded bg-amber-100 px-1 py-px text-[10px] text-amber-800">
                              姓違い
                            </span>
                          )}
                          {g.nameCheck === 'mismatch' && (
                            <span className="ml-1 rounded bg-red-100 px-1 py-px text-[10px] text-red-700">
                              名義不一致
                            </span>
                          )}
                        </td>
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
