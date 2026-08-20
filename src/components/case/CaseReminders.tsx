/**
 * リマインド（案件ごとの「いつ・何をする」）。
 *
 * kintone では和解対象債権の表に「★リマインド」という債権者の行を作って
 * 運用していたもの。債権社数の集計を狂わせていたため独立させた。
 *   期日 = kintone の「次回処理日時」
 *   内容 = kintone の「交渉相手」欄
 *   済   = kintone の check
 */
import { useCallback, useEffect, useState } from 'react'
import { formatYmdInput, isValidYmd } from '../../lib/dateInput'

type Reminder = {
  id: number
  caseId: number
  dueDate: string | null
  body: string
  done: boolean
  doneAt: string | null
  doneBy: string | null
  source: string
  createdAt: string
}

const todayYmd = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function CaseReminders({ caseId, locked = false }: { caseId: number; locked?: boolean }) {
  const [rows, setRows] = useState<Reminder[]>([])
  const [due, setDue] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/cases/${caseId}/reminders`)
      .then((r) => (r.ok ? (r.json() as Promise<Reminder[]>) : null))
      .then((d) => {
        if (d) setRows(d)
      })
      .catch(() => {
        /* 次回の再取得で回復 */
      })
  }, [caseId])

  useEffect(load, [load])

  const add = async () => {
    const text = body.trim()
    if (!text) {
      setError('内容を入れてください')
      return
    }
    if (due && !isValidYmd(due)) {
      setError('期日が正しくありません（YYYY-MM-DD）')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/cases/${caseId}/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: due || null, body: text }),
      })
      const d = (await r.json()) as { reminder?: Reminder; error?: string }
      if (!r.ok || !d.reminder) throw new Error(d.error ?? '追加できませんでした')
      setRows((prev) => [...prev, d.reminder!])
      setDue('')
      setBody('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const patch = async (id: number, data: Partial<Pick<Reminder, 'done' | 'body' | 'dueDate'>>) => {
    // 先に画面へ反映して、失敗したら読み直す
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...data } : r)))
    const r = await fetch(`/api/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => null)
    if (!r || !r.ok) load()
  }

  const remove = async (id: number) => {
    if (!window.confirm('このリマインドを削除しますか？')) return
    setRows((prev) => prev.filter((r) => r.id !== id))
    const r = await fetch(`/api/reminders/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!r || !r.ok) load()
  }

  const today = todayYmd()

  return (
    <div className="space-y-2 p-2">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-xs text-slate-400">リマインドはありません</div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded border border-slate-200">
          {rows.map((r) => {
            const overdue = !r.done && r.dueDate != null && r.dueDate < today
            return (
              <li key={r.id} className="flex items-start gap-2 px-2 py-1">
                <input
                  type="checkbox"
                  checked={r.done}
                  disabled={locked}
                  onChange={(e) => void patch(r.id, { done: e.target.checked })}
                  className="mt-0.5 shrink-0"
                  title="対応が済んだらチェック"
                />
                <span
                  className={`w-24 shrink-0 text-xs tabular-nums ${
                    overdue ? 'font-bold text-red-600' : 'text-slate-500'
                  }`}
                  title={overdue ? '期日を過ぎています' : undefined}
                >
                  {r.dueDate ?? '期日なし'}
                </span>
                <span
                  className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-xs ${
                    r.done ? 'text-slate-400 line-through' : 'text-slate-800'
                  }`}
                >
                  {r.body}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(r.id)}
                  disabled={locked}
                  className="shrink-0 text-[10px] text-slate-400 hover:text-red-600 disabled:text-slate-200"
                >
                  削除
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center gap-1">
        <input
          value={due}
          onChange={(e) => setDue(formatYmdInput(e.target.value))}
          placeholder="20260822"
          disabled={locked}
          className="w-28 rounded border border-slate-300 px-1.5 py-1 text-xs"
          title="期日（数字8桁で入れると自動で区切ります）"
        />
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder="やること（例: イレギュラー入金を外す）"
          disabled={locked}
          className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={locked || busy}
          className="shrink-0 rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:bg-slate-300"
        >
          追加
        </button>
      </div>
    </div>
  )
}
