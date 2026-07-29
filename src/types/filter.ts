/**
 * 絞り込み条件のデータ構造（クライアント・サーバ共用）。
 *
 * 旧形式 `{ field, value }`（値に ">=100000" のような記法を書く）も引き続き
 * 受け付ける。新形式は演算子と値を分けて持つ。
 *   旧: { field: 'declaredDebtAmount', value: '>=100000' }
 *   新: { field: 'declaredDebtAmount', operator: 'gte', values: ['100000'] }
 */

/** 演算子 */
export type FilterOperator =
  | 'contains' // 含む（部分一致）
  | 'notContains' // 含まない
  | 'eq' // 等しい
  | 'ne' // 等しくない
  | 'in' // いずれかを含む（選択肢の複数選択）
  | 'notIn' // いずれも含まない
  | 'gt' // より大きい
  | 'lt' // より小さい
  | 'gte' // 以上
  | 'lte' // 以下
  | 'between' // 範囲（両端を含む）
  | 'empty' // 空である
  | 'notEmpty' // 空でない

/** 値の入力が不要な演算子 */
export const NO_VALUE_OPERATORS: FilterOperator[] = ['empty', 'notEmpty']

/** 値を2つ取る演算子 */
export const TWO_VALUE_OPERATORS: FilterOperator[] = ['between']

/** 複数値を取る演算子 */
export const MULTI_VALUE_OPERATORS: FilterOperator[] = ['in', 'notIn']

export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  contains: '次のキーワードを含む',
  notContains: '次のキーワードを含まない',
  eq: '＝（等しい）',
  ne: '≠（等しくない）',
  in: '次のいずれかを含む',
  notIn: '次のいずれも含まない',
  gt: '＞（より大きい）',
  lt: '＜（より小さい）',
  gte: '≧（以上）',
  lte: '≦（以下）',
  between: '範囲（〜から〜まで）',
  empty: '空である',
  notEmpty: '空でない',
}

/** 検索フィールドの種別 */
export type FilterFieldType =
  | 'text' // 文字列（部分一致中心）
  | 'choice' // 選択肢（複数選択）
  | 'number' // 数値
  | 'date' // 日付
  | 'phone' // 電話番号（数字のみに正規化して照合）
  | 'creditor' // 債権者名（リレーション検索）

/** 種別ごとに使える演算子 */
export const OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  text: ['contains', 'notContains', 'eq', 'ne', 'empty', 'notEmpty'],
  choice: ['in', 'notIn', 'empty', 'notEmpty'],
  number: ['eq', 'ne', 'gte', 'lte', 'gt', 'lt', 'between', 'empty', 'notEmpty'],
  date: ['eq', 'ne', 'gte', 'lte', 'gt', 'lt', 'between', 'empty', 'notEmpty'],
  phone: ['contains', 'notContains', 'empty', 'notEmpty'],
  creditor: ['contains', 'notContains'],
}

/**
 * 日付の相対指定トークン。値としてそのまま格納する。
 * サーバ側で「その期間の開始日〜終了日」に解決する。
 */
export const DATE_TOKENS = [
  'TODAY',
  'YESTERDAY',
  'TOMORROW',
  'THIS_WEEK',
  'LAST_WEEK',
  'NEXT_WEEK',
  'THIS_MONTH',
  'LAST_MONTH',
  'NEXT_MONTH',
  'THIS_YEAR',
  'LAST_YEAR',
  'NEXT_YEAR',
] as const

export type DateToken = (typeof DATE_TOKENS)[number]

export const DATE_TOKEN_LABEL: Record<DateToken, string> = {
  TODAY: '今日',
  YESTERDAY: '昨日',
  TOMORROW: '明日',
  THIS_WEEK: '今週',
  LAST_WEEK: '先週',
  NEXT_WEEK: '来週',
  THIS_MONTH: '今月',
  LAST_MONTH: '先月',
  NEXT_MONTH: '来月',
  THIS_YEAR: '今年',
  LAST_YEAR: '昨年',
  NEXT_YEAR: '来年',
}

/** 今日からの相対日数。`FROM_TODAY:-7:DAYS` の形式で値に格納する */
export const RELATIVE_UNITS = ['DAYS', 'WEEKS', 'MONTHS', 'YEARS'] as const
export type RelativeUnit = (typeof RELATIVE_UNITS)[number]
export const RELATIVE_UNIT_LABEL: Record<RelativeUnit, string> = {
  DAYS: '日',
  WEEKS: '週',
  MONTHS: 'か月',
  YEARS: '年',
}

export function buildRelativeToken(n: number, unit: RelativeUnit): string {
  return `FROM_TODAY:${n}:${unit}`
}

export function parseRelativeToken(
  value: string
): { n: number; unit: RelativeUnit } | null {
  const m = /^FROM_TODAY:(-?\d+):(DAYS|WEEKS|MONTHS|YEARS)$/.exec(value)
  if (!m) return null
  return { n: Number(m[1]), unit: m[2] as RelativeUnit }
}

export function isDateToken(value: string): value is DateToken {
  return (DATE_TOKENS as readonly string[]).includes(value)
}

/** 1つの条件 */
export type FilterCondition = {
  field: string
  operator: FilterOperator
  values: string[]
}

/** 絞り込み条件のまとまり */
export type FilterQuery = {
  /** 条件のつなぎ方。and=すべて満たす / or=いずれかを満たす */
  logic: 'and' | 'or'
  conditions: FilterCondition[]
}

export function emptyFilterQuery(): FilterQuery {
  return { logic: 'and', conditions: [] }
}

/** 値が入っていて実際に効く条件かどうか */
export function isEffectiveCondition(c: FilterCondition): boolean {
  if (NO_VALUE_OPERATORS.includes(c.operator)) return true
  const filled = (c.values ?? []).filter((v) => v != null && String(v).trim() !== '')
  if (TWO_VALUE_OPERATORS.includes(c.operator)) return filled.length === 2
  return filled.length > 0
}

/** 実際に効く条件だけを残す */
export function compactFilterQuery(q: FilterQuery): FilterQuery {
  return { logic: q.logic, conditions: (q.conditions ?? []).filter(isEffectiveCondition) }
}
