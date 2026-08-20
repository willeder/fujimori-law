/**
 * 日付入力の整形と検証。
 *
 * ブラウザ標準の <input type="date"> は、Chrome の「年」欄が6桁まで受け付けるため
 * 「20260608」と打つと 202606-08-日 になってしまう（事務所からのご指摘）。
 * 数字だけを受け取り、4桁2桁2桁で自動的にハイフンを入れる独自入力に置き換える。
 */

/**
 * 入力中の文字列を YYYY-MM-DD へ整形する。
 *   2026     → "2026"
 *   202606   → "2026-06"
 *   20260608 → "2026-06-08"
 * 「2026/06/08」のような区切り付きの貼り付けも受け取れる。
 */
export function formatYmdInput(raw: string): string {
  const d = raw.replace(/[^0-9]/g, '').slice(0, 8)
  if (d.length <= 4) return d
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
}

/** YYYY-MM-DD として成立しているか（実在しない日付は弾く。例 2026-02-29 / 2026-06-31） */
export function isValidYmd(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  if (mo < 1 || mo > 12 || da < 1) return false
  return da <= new Date(y, mo, 0).getDate()
}
