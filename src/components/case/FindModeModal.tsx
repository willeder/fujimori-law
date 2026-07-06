/**
 * FileMaker風「検索モード」モーダル。
 * 案件詳細レコードで Ctrl+F により開き、各フィールドに文字列を入力（複数可）して
 * 「検索」すると、入力した全条件（AND）で案件一覧を絞り込む。
 */
import { useState } from 'react'
import { SEARCH_FIELDS, type Condition } from '../../pages/searchFields'

export function FindModeModal({
  open,
  onClose,
  onSearch,
}: {
  open: boolean
  onClose: () => void
  onSearch: (conditions: Condition[]) => void
}) {
  const [vals, setVals] = useState<Record<string, string>>({})
  if (!open) return null

  const submit = () => {
    const conditions = SEARCH_FIELDS.filter((f) => (vals[f.field] ?? '').trim()).map((f) => ({
      field: f.field,
      value: vals[f.field].trim(),
    }))
    if (conditions.length > 0) onSearch(conditions)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="mt-12 w-full max-w-3xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-bold text-slate-800">
            検索モード（複数フィールドAND）
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>
        <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-auto p-4 sm:grid-cols-3">
          {SEARCH_FIELDS.map((f) => (
            <label key={f.field} className="flex flex-col gap-0.5 text-[10px] text-slate-500">
              {f.label}
              <input
                value={vals[f.field] ?? ''}
                onChange={(e) => setVals((v) => ({ ...v, [f.field]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-2">
          <button
            type="button"
            onClick={submit}
            className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            検索
          </button>
          <button
            type="button"
            onClick={() => setVals({})}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
          >
            クリア
          </button>
          <span className="text-[10px] text-slate-400">
            入力した全フィールドに一致（AND）。Enterで検索 / Escで閉じる。
            数値・日付は比較式が使えます（例: &gt;=100000、&lt;2026-07-01、100000..200000、2026-04-01〜2026-06-30）
          </span>
        </div>
      </div>
    </div>
  )
}
