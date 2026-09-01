/**
 * 候補付きテキスト入力（自前コンボボックス）。
 * HTML の datalist はブラウザ依存が強く（Safari はほぼ非対応・Chrome もクリックで
 * 開かないことがある）実用にならないため、自前のドロップダウンで実装する。
 *
 * 挙動:
 *   - クリック/フォーカスで候補を全件表示（スクロール可・最大 maxItems 件）
 *   - 入力すると部分一致で絞り込み
 *   - 候補クリック / ↑↓キー＋Enter で選択（自由入力もそのまま可能）
 *   - Esc で候補を閉じる
 */
import { useMemo, useState } from 'react'

interface SuggestInputProps {
  value: string
  onValueChange: (v: string) => void
  /** 候補を確定選択したとき（クリック/ハイライト中Enter）。未指定なら onValueChange のみ */
  onSelect?: (v: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
  autoFocus?: boolean
  /** 一度に表示する最大件数（既定300。超過分は入力で絞り込み） */
  maxItems?: number
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export function SuggestInput({
  value,
  onValueChange,
  onSelect,
  suggestions,
  placeholder,
  className,
  autoFocus = false,
  maxItems = 300,
  onBlur,
  onKeyDown,
}: SuggestInputProps) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1) // ハイライト中の候補index（-1=なし）

  const { filtered, total } = useMemo(() => {
    const q = value.trim().toLowerCase()
    const base = q ? suggestions.filter((s) => s.toLowerCase().includes(q)) : suggestions
    return { filtered: base.slice(0, maxItems), total: base.length }
  }, [value, suggestions, maxItems])

  const select = (v: string) => {
    onValueChange(v)
    onSelect?.(v)
    setOpen(false)
    setHi(-1)
  }

  return (
    <div className="relative min-w-0">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value)
          setOpen(true)
          setHi(-1)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          setHi(-1)
          onBlur?.()
        }}
        onKeyDown={(e) => {
          if (open && filtered.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHi((h) => Math.min(h + 1, filtered.length - 1))
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHi((h) => Math.max(h - 1, 0))
              return
            }
            if (e.key === 'Enter' && hi >= 0) {
              e.preventDefault()
              e.stopPropagation()
              select(filtered[hi])
              return
            }
            if (e.key === 'Escape') {
              e.stopPropagation()
              setOpen(false)
              setHi(-1)
              return
            }
          }
          onKeyDown?.(e)
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={className}
      />
      {open && filtered.length > 0 && (
        <div
          // mousedown で input の blur を発生させない（スクロールバー操作・候補クリック対策）
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 top-full z-[80] mt-0.5 max-h-56 w-max min-w-full max-w-[22rem] overflow-auto rounded border border-slate-300 bg-white shadow-lg"
        >
          {filtered.map((s, i) => (
            <button
              type="button"
              key={s}
              onMouseDown={(e) => {
                e.preventDefault()
                select(s)
              }}
              onMouseEnter={() => setHi(i)}
              className={`block w-full truncate px-2 py-1 text-left text-xs ${
                i === hi ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
          {total > filtered.length && (
            <div className="border-t border-slate-100 px-2 py-1 text-[0.625rem] text-slate-400">
              {total}件中 先頭{filtered.length}件を表示（入力で絞り込めます）
            </div>
          )}
        </div>
      )}
    </div>
  )
}
