/**
 * 検索履歴（直近10件・localStorage 保存）。
 * Ctrl+F の検索モードモーダルと、案件一覧の詳細検索パネルで共有する（No.147）。
 */
import { SEARCH_FIELDS, type Condition } from '../pages/searchFields'

const HISTORY_KEY = 'findMode.history'
const HISTORY_MAX = 10

export function loadFindHistory(): Condition[][] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as Condition[][]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 実行した検索条件を履歴の先頭へ保存（同一条件は重複させず最大10件）。保存後の履歴を返す */
export function saveFindHistory(conditions: Condition[]): Condition[][] {
  const key = JSON.stringify(conditions)
  const next = [
    conditions,
    ...loadFindHistory().filter((h) => JSON.stringify(h) !== key),
  ].slice(0, HISTORY_MAX)
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* 保存失敗時は履歴なしで続行 */
  }
  return next
}

const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  SEARCH_FIELDS.map((f) => [f.field, f.label])
)

/** 履歴1件の表示ラベル（例: 「名前:田中 / 申告債務額:>=100000」） */
export function findHistoryLabel(conditions: Condition[]): string {
  return conditions.map((c) => `${FIELD_LABEL[c.field] ?? c.field}:${c.value}`).join(' / ')
}
