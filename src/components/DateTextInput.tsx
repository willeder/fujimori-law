/**
 * 日付の入力欄（打ち込み＋カレンダー）。
 *
 * 打ち込みは数字8桁で受ける（20260901 → 2026-09-01）。ブラウザ標準の日付入力は
 * Chrome の「年」が6桁まで入ってしまい「202606-08-日」になるため使っていない
 * （藤川様 2026-08-08 のご指摘。src/lib/dateInput.ts 参照）。
 *
 * そのうえで、右端のカレンダーのアイコンから選べるようにしている。kintone では
 * カレンダーから選ぶことが多く、そちらに慣れている、というご要望（竹谷様 2026-08-21）。
 * アイコンの上に透明な日付入力を重ねてあり、押すとブラウザのカレンダーが開く。
 * 年を打ち込む余地はないので、6桁問題は起きない。
 */
import { formatYmdInput, isValidYmd } from '../lib/dateInput'

type Props = {
  value: string
  onChange: (next: string) => void
  /** カレンダーで選んだとき。選んだ時点で確定させたいので onChange とは分けている */
  onPick: (next: string) => void
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  inputRef?: React.RefObject<HTMLInputElement>
  /**
   * 横幅を親いっぱいに伸ばすか。既定は伸ばす（項目の欄で使うため）。
   * 幅を className で決めている場所では false にする。true のままだと
   * 余白ができて、隣の入力欄との間が空きすぎる。
   */
  grow?: boolean
}

export function DateTextInput({
  value,
  onChange,
  onPick,
  onBlur,
  onKeyDown,
  placeholder,
  className,
  autoFocus,
  inputRef,
  grow = true,
}: Props) {
  return (
    <span className={`flex min-w-0 items-center gap-0.5 ${grow ? 'flex-1' : ''}`}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(formatYmdInput(e.target.value))}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={className}
      />
      <span
        className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-blue-600"
        title="カレンダーから選ぶ"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        </svg>
        {/* アイコンの上に重ねた日付入力。押すとカレンダーが開く。
            打ち込みには使わせないので、年6桁の問題は起きない。 */}
        <input
          type="date"
          value={isValidYmd(value) ? value : ''}
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            onChange(v)
            onPick(v)
          }}
          tabIndex={-1}
          aria-label="カレンダーから日付を選ぶ"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
    </span>
  )
}
