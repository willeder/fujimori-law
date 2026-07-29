/** 横断検索（絞り込みモーダル / FileMaker風検索モード）で共有する検索フィールド定義 */
import {
  CASE_STATUS_OPTIONS,
  DEBT_ADJUSTMENT_TYPE_OPTIONS,
  PREFECTURE_OPTIONS,
  RANK_OPTIONS,
} from '../constants/fieldOptions'
import type { FilterFieldType } from '../types/filter'

/** 旧形式の条件（値に ">=100000" 等の記法を書く）。検索モードや検索履歴で引き続き使用 */
export type Condition = { field: string; value: string }

/** 検索フィールドの定義 */
export type SearchFieldDef = {
  field: string
  label: string
  /** 未指定は 'text' 扱い */
  type?: FilterFieldType
  /** type: 'choice' のときの選択肢 */
  options?: readonly string[]
}

export const SEARCH_FIELDS: SearchFieldDef[] = [
  { field: 'externalId', label: 'ID' },
  { field: 'name', label: '名前' },
  { field: 'furigana', label: 'フリガナ' },
  { field: 'phone', label: '電話番号', type: 'phone' },
  { field: 'email', label: 'メール' },
  { field: 'prefecture', label: '都道府県', type: 'choice', options: PREFECTURE_OPTIONS },
  { field: 'address', label: '住所' },
  { field: 'birthDate', label: '生年月日', type: 'date' },
  { field: 'acceptanceDate', label: '受任日', type: 'date' },
  {
    field: 'settlementStatus',
    label: '受任後ステータス',
    type: 'choice',
    options: CASE_STATUS_OPTIONS,
  },
  {
    field: 'debtAdjustmentType',
    label: '債務整理区分',
    type: 'choice',
    options: DEBT_ADJUSTMENT_TYPE_OPTIONS,
  },
  { field: 'cautionRank', label: '要注意ランク', type: 'choice', options: RANK_OPTIONS },
  { field: 'acceptanceRank', label: '受任ランク', type: 'choice', options: RANK_OPTIONS },
  { field: 'appointmentStaff', label: 'アポ担当' },
  { field: 'interviewStaff', label: '面談担当' },
  { field: 'judicialScrivener', label: '担当司法書士' },
  { field: 'employerName', label: '勤務先' },
  { field: 'listCategory', label: 'リスト区分' },
  { field: 'creditorName', label: '債権者名', type: 'creditor' },
  { field: 'declaredDebtAmount', label: '申告債務額', type: 'number' },
  { field: 'creditorCount', label: '債権社数', type: 'number' },
]

/** フィールドコード → 定義 */
export const SEARCH_FIELD_MAP: Record<string, SearchFieldDef | undefined> =
  Object.fromEntries(SEARCH_FIELDS.map((f) => [f.field, f]))

/** フィールドコード → 日本語ラベル */
export const SEARCH_FIELD_LABEL: Record<string, string | undefined> = Object.fromEntries(
  SEARCH_FIELDS.map((f) => [f.field, f.label])
)

export function fieldTypeOf(field: string): FilterFieldType {
  return SEARCH_FIELD_MAP[field]?.type ?? 'text'
}

export function fieldLabelOf(field: string): string {
  return SEARCH_FIELD_LABEL[field] ?? field
}
