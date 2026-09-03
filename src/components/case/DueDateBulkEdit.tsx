/**
 * 入金期日の一括変更。
 *
 * 事務所のご要望（2026-09-03。新システム改修要望シート 8行目）:
 *   「入金期日変更ボタンを設置」「ボタン押下で期日変更画面のポップアップ」
 *   「1月から12月を順に並べて、その横に日付を変更できるフィールドを配置」
 *   「上部に全月の日付を一括で変更できる箇所を設置」
 *   「変更ボタンを押下すると、未来日の入金予定日の期日が全て変更される」
 *
 * 実データでは1案件あたり未来分が平均57行・最大127行。給料日が変わるたびに
 * これを手で直すのは現実的でない、というのが背景。
 *
 * 決めごと（事務所と確認済み）:
 *   ・その月に無い日（2月31日など）は その月の末日に寄せる
 *   ・対象は 今日以降。ただし 実入金がある行は変更しない
 *   ・触るのは入金予定日だけ。金額・充当・実績には手を付けない
 *
 * 実行前に必ず下見（何行がどう変わるか）を出してから確定する。
 */
import { useState } from 'react'

type Change = { paymentId: number; from: string; to: string }
type Plan = {
  changes: Change[]
  skippedPaid: number
  skippedNoRule: number
  skippedSame: number
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export function DueDateBulkEdit({
  caseId,
  onDone,
}: {
  caseId: number
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState<Record<number, string>>({})
  const [bulk, setBulk] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setDays({})
    setBulk('')
    setPlan(null)
    setError(null)
  }

  /** 上部の一括入力。空欄の月だけでなく全月に入れる（打ち直しの手間を減らす） */
  const applyBulk = (v: string) => {
    setBulk(v)
    const n = Number(v)
    if (!v.trim() || !Number.isFinite(n)) return
    const next: Record<number, string> = {}
    for (const m of MONTHS) next[m] = String(Math.min(31, Math.max(1, Math.trunc(n))))
    setDays(next)
    setPlan(null)
  }

  const body = () => {
    const byMonth: Record<number, number | null> = {}
    for (const m of MONTHS) {
      const v = (days[m] ?? '').trim()
      const n = Number(v)
      byMonth[m] = v && Number.isFinite(n) ? Math.min(31, Math.max(1, Math.trunc(n))) : null
    }
    return JSON.stringify({ byMonth })
  }

  const preview = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/cases/${caseId}/due-dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body(),
      })
      const d = (await r.json()) as Plan & { error?: string }
      if (!r.ok) {
        setError(d.error ?? '確認できませんでした')
        return
      }
      setPlan(d)
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/cases/${caseId}/due-dates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: body(),
      })
      const d = (await r.json()) as { error?: string; changes?: Change[] }
      if (!r.ok) {
        setError(d.error ?? '変更できませんでした')
        return
      }
      setOpen(false)
      reset()
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const anyDay = MONTHS.some((m) => (days[m] ?? '').trim())

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        title="給料日が変わったときなどに、今日以降の入金予定日をまとめて直します"
        className="rounded border border-blue-500 bg-white px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
      >
        入金期日変更
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-10 w-full max-w-2xl rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <h2 className="text-sm font-bold text-slate-800">入金期日の変更</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto px-4 py-3">
              {/* 上部: 全月まとめて */}
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2">
                <span className="text-xs font-semibold text-slate-700">全ての月を</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={bulk}
                  onChange={(e) => applyBulk(e.target.value)}
                  className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-xs"
                  placeholder="25"
                />
                <span className="text-xs text-slate-700">日にする</span>
                <span className="text-[0.6875rem] text-slate-500">
                  （入れたあと、月ごとに個別で直せます）
                </span>
              </div>

              {/* 1月〜12月 */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                {MONTHS.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-xs">
                    <span className="w-10 text-right text-slate-600">{m}月</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={days[m] ?? ''}
                      onChange={(e) => {
                        setDays((prev) => ({ ...prev, [m]: e.target.value }))
                        setPlan(null)
                      }}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-right"
                      placeholder="—"
                    />
                    <span className="text-slate-500">日</span>
                  </label>
                ))}
              </div>

              <p className="mt-3 text-[0.6875rem] leading-relaxed text-slate-500">
                ・空欄の月は変更しません。
                <br />
                ・31日のようにその月に無い日は、その月の末日に寄せます（2月なら28日か29日）。
                <br />
                ・変わるのは<b>今日以降</b>の入金予定日だけです。既に入金がある行は変更しません。
                <br />
                ・金額や充当には手を付けません。
              </p>

              {error && <div className="mt-2 text-xs text-red-600">{error}</div>}

              {/* 下見 */}
              {plan && (
                <div className="mt-3 rounded border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
                    <b className="text-blue-700">{plan.changes.length}行</b> の期日が変わります
                    <span className="ml-2 text-slate-500">
                      （入金済みのため対象外 {plan.skippedPaid}行 ／ 指定の無い月 {plan.skippedNoRule}行 ／
                      すでに同じ日 {plan.skippedSame}行）
                    </span>
                  </div>
                  <div className="max-h-52 overflow-auto px-3 py-1 text-xs">
                    {plan.changes.length === 0 ? (
                      <div className="py-2 text-slate-400">変わる行はありません。</div>
                    ) : (
                      plan.changes.map((c) => (
                        <div key={c.paymentId} className="tabular-nums text-slate-700">
                          <span className="text-slate-400 line-through">{c.from}</span>
                          {' → '}
                          <span className="font-semibold">{c.to}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                やめる
              </button>
              <button
                type="button"
                disabled={busy || !anyDay}
                onClick={preview}
                className="rounded border border-blue-500 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-40"
              >
                変更内容を確認
              </button>
              <button
                type="button"
                disabled={busy || !plan || plan.changes.length === 0}
                onClick={commit}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {plan ? `${plan.changes.length}行を変更` : '変更'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
