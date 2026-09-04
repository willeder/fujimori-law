/**
 * 表の行編集で入力値を受け取るときの決まりごと。
 *
 * ★ 0 を入れられなかった不具合（2026-09-04）
 *   これまで各表は `Number(e.target.value) || null` で数値を受けていた。
 *   これだと **0 を入れると null（空）になる**。JavaScript では 0 が偽なので
 *   `0 || null` が null になるため。報酬額 0・手数料 0 のように 0 と空欄を
 *   区別する列があるので、0 は 0 のまま受け取る。
 *
 * 空欄（消したとき）は null。数字として読めないものも null にする。
 */
import { isValidYmd } from './dateInput'

export function numOrNull(raw: string): number | null {
  const s = raw.trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * 打ち込み途中の日付（「2026-0」など）のまま保存させないための確認。
 *
 * 日付欄を打ち込み式にしたので、8桁そろう前に保存を押せてしまう。
 * そのまま送ると空として保存され、入れたつもりの日付が消えるので、
 * 保存前にここで止めて、どの欄がおかしいかを知らせる。
 *
 * @returns 問題があればその案内文。無ければ null
 */
export function checkYmdFields(
  values: Record<string, unknown>,
  fields: readonly (readonly [string, string])[]
): string | null {
  for (const [key, name] of fields) {
    const v = values[key]
    if (typeof v !== 'string' || v === '') continue
    if (!isValidYmd(v)) {
      return `${name}を「${v}」として読み取れません。20260928 のように8桁で入れてください。`
    }
  }
  return null
}
