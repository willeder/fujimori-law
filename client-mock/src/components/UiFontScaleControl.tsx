import { useUiFontScale, type UiFontScale } from '../context/UiFontScaleContext'

type UiFontScaleControlProps = {
  /** ヘッダーが狭いときは select のみ */
  variant?: 'segmented' | 'select'
}

const OPTIONS: { value: UiFontScale; label: string }[] = [
  { value: 'standard', label: '標準' },
  { value: 'compact', label: 'やや小' },
  { value: 'dense', label: '小' },
]

export function UiFontScaleControl({ variant = 'segmented' }: UiFontScaleControlProps) {
  const { scale, setScale } = useUiFontScale()

  if (variant === 'select') {
    return (
      <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
        <span className="whitespace-nowrap">文字</span>
        <select
          value={scale}
          onChange={(e) => setScale(e.target.value as UiFontScale)}
          className="max-w-[5.5rem] rounded border border-slate-300 bg-white py-1 pl-1.5 pr-6 text-xs text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          title="画面全体の文字サイズ（一覧の行数に影響）"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 shadow-sm"
      role="group"
      aria-label="画面全体の文字サイズ"
      title="一覧・詳細の文字をまとめて縮小し、同じ高さにより多く表示できます"
    >
      {OPTIONS.map((o) => {
        const active = scale === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setScale(o.value)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
            }`}
            aria-pressed={active}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
