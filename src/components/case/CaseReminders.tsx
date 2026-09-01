/**
 * リマインド（案件ごとの「いつ・何をする」）。
 *
 * kintone では和解対象債権の表に「★リマインド」という債権者の行を作って
 * 運用していたもの。債権社数の集計を狂わせていたため独立させた。
 *   期日 = kintone の「次回処理日時」
 *   内容 = kintone の「交渉相手」欄
 *   済   = kintone の check
 */
import { useState } from 'react'
import { formatYmdInput, isValidYmd } from '../../lib/dateInput'
// 状態は上部のバナーと共有する。別々に持つと、片方で「済」にしても
// もう片方に残ってしまうため（useCaseReminders 参照）。
import { useCaseReminders, todayYmd } from '../../hooks/useCaseReminders'

export function CaseReminders({ caseId, locked = false }: { caseId: number; locked?: boolean }) {
  const { rows, add: addReminder, patch, remove: removeReminder } = useCaseReminders(caseId)
  const [due, setDue] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 追加したあとに期日や内容を直せるようにする（藤川様・堀本様 2026-08-21/22）。
  // 「期限を延期したいが編集ボタンが見当たらない」というご指摘への対応。
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDue, setEditDue] = useState('')
  const [editBody, setEditBody] = useState('')

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
    const err = await addReminder(due || null, text)
    if (err) setError(err)
    else {
      setDue('')
      setBody('')
    }
    setBusy(false)
  }

  const remove = async (id: number) => {
    if (!window.confirm('このリマインドを削除しますか？')) return
    await removeReminder(id)
  }

  const startEdit = (r: { id: number; dueDate: string | null; body: string }) => {
    setError(null)
    setEditingId(r.id)
    setEditDue(r.dueDate ?? '')
    setEditBody(r.body)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDue('')
    setEditBody('')
  }

  const saveEdit = async (id: number) => {
    const text = editBody.trim()
    if (!text) {
      setError('内容を入れてください')
      return
    }
    if (editDue && !isValidYmd(editDue)) {
      setError('期日が正しくありません（YYYY-MM-DD）')
      return
    }
    setBusy(true)
    setError(null)
    // patch は画面に先に反映し、失敗したらサーバから取り直す作りなので
    // ここでは戻り値を見ない（useCaseReminders 参照）。
    await patch(id, { dueDate: editDue || null, body: text })
    cancelEdit()
    setBusy(false)
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
            if (editingId === r.id) {
              return (
                <li key={r.id} className="flex items-center gap-1 bg-amber-50 px-2 py-1">
                  <input
                    value={editDue}
                    onChange={(e) => setEditDue(formatYmdInput(e.target.value))}
                    placeholder="20260822"
                    className="w-28 shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs"
                    title="期日（数字8桁で入れると自動で区切ります。空にすると期日なし）"
                  />
                  <input
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveEdit(r.id)
                      if (e.key === 'Escape') cancelEdit()
                    }}
                    className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void saveEdit(r.id)}
                    disabled={busy}
                    className="shrink-0 rounded bg-blue-500 px-2 py-1 text-[0.625rem] text-white hover:bg-blue-600 disabled:bg-slate-300"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="shrink-0 px-1 text-[0.625rem] text-slate-500 hover:text-slate-800"
                  >
                    取消
                  </button>
                </li>
              )
            }
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
                  onClick={() => startEdit(r)}
                  disabled={locked}
                  className="shrink-0 text-[0.625rem] text-slate-400 hover:text-blue-600 disabled:text-slate-200"
                  title="期日や内容を直します（期日の延期もここから）"
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => void remove(r.id)}
                  disabled={locked}
                  className="shrink-0 text-[0.625rem] text-slate-400 hover:text-red-600 disabled:text-slate-200"
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
