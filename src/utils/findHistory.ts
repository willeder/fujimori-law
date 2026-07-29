/**
 * 検索履歴（直近10件・localStorage 保存）。
 * Ctrl+F の検索モードモーダルと、案件一覧の詳細検索パネルで共有する（No.147）。
 */
import { SEARCH_FIELDS, type Condition } from '../pages/searchFields'
import { NO_VALUE_OPERATORS, OPERATOR_LABEL, type FilterQuery } from '../types/filter'

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

// ── 絞り込みモーダル（演算子つき）の履歴 ─────────────────────────
// 検索モードの履歴（上）とは形式が違うため、キーを分けて別管理する。

const FILTER_HISTORY_KEY = 'caseList.filterHistory'

export function loadFilterHistory(): FilterQuery[] {
  try {
    const raw = localStorage.getItem(FILTER_HISTORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as FilterQuery[]) : []
    return Array.isArray(parsed) ? parsed.filter((q) => q && Array.isArray(q.conditions)) : []
  } catch {
    return []
  }
}

/** 実行した絞り込みを履歴の先頭へ保存（同一条件は重複させず最大10件）。保存後の履歴を返す */
export function saveFilterHistory(query: FilterQuery): FilterQuery[] {
  if (!query.conditions.length) return loadFilterHistory()
  const key = JSON.stringify(query)
  const next = [query, ...loadFilterHistory().filter((h) => JSON.stringify(h) !== key)].slice(
    0,
    HISTORY_MAX
  )
  try {
    localStorage.setItem(FILTER_HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* 保存失敗時は履歴なしで続行 */
  }
  return next
}

/** 履歴1件の表示ラベル（例: 「受任後ステータス いずれかを含む 和解交渉中」） */
export function filterHistoryLabel(query: FilterQuery): string {
  const joiner = query.logic === 'or' ? ' または ' : ' かつ '
  return query.conditions
    .map((c) => {
      const label = FIELD_LABEL[c.field] ?? c.field
      if (NO_VALUE_OPERATORS.includes(c.operator)) return `${label} ${OPERATOR_LABEL[c.operator]}`
      const vals = (c.values ?? []).filter((v) => String(v).trim() !== '')
      return `${label} ${OPERATOR_LABEL[c.operator]} ${vals.join('・')}`
    })
    .join(joiner)
}
