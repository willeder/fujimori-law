/** 横断検索（kintone風パネル / FileMaker風検索モード）で共有する検索フィールド定義 */
export type Condition = { field: string; value: string }

export const SEARCH_FIELDS: { field: string; label: string }[] = [
  { field: 'externalId', label: 'ID' },
  { field: 'name', label: '名前' },
  { field: 'furigana', label: 'フリガナ' },
  { field: 'phone', label: '電話番号' },
  { field: 'email', label: 'メール' },
  { field: 'prefecture', label: '都道府県' },
  { field: 'address', label: '住所' },
  { field: 'birthDate', label: '生年月日（年/年月/年月日）' },
  { field: 'acceptanceDate', label: '受任日（年/年月/年月日）' },
  { field: 'settlementStatus', label: '受任後ステータス' },
  { field: 'debtAdjustmentType', label: '債務整理区分' },
  { field: 'cautionRank', label: '要注意ランク' },
  { field: 'acceptanceRank', label: '受任ランク' },
  { field: 'appointmentStaff', label: 'アポ担当' },
  { field: 'interviewStaff', label: '面談担当' },
  { field: 'judicialScrivener', label: '担当司法書士' },
  { field: 'employerName', label: '勤務先' },
  { field: 'listCategory', label: 'リスト区分' },
  { field: 'creditorName', label: '債権者名' },
  { field: 'declaredDebtAmount', label: '申告債務額' },
  { field: 'creditorCount', label: '債権社数' },
]
