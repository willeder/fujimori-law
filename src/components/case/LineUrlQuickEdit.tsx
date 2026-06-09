import { useEffect, useRef, useState } from 'react'

type LineUrlQuickEditProps = {
  lineUrl: string | null | undefined
  onSave: (next: string | null) => void
}

/** ヘッダー用：レイアウトを崩さず URL の修正のみポップオーバーで行う */
export function LineUrlQuickEdit({ lineUrl, onSave }: LineUrlQuickEditProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setDraft(lineUrl?.trim() ?? '')
  }, [open, lineUrl])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const commit = () => {
    const t = draft.trim()
    onSave(t.length > 0 ? t : null)
    setOpen(false)
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="LINE@ URLを編集"
        title="LINE@ URLを編集"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-[min(calc(100vw-1.5rem),20rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
          role="dialog"
          aria-label="LINE@ URL"
        >
          <label htmlFor="line-url-quick-edit" className="text-xs font-medium text-slate-600">
            LINE@ URL
          </label>
          <textarea
            id="line-url-quick-edit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            placeholder="https://chat.line.biz/…"
            className="mt-1.5 w-full resize-y rounded border border-slate-200 px-2 py-1.5 font-mono text-[11px] leading-snug text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={commit}
              className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >
              保存
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
