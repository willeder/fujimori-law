/** 横断検索（絞り込みモーダル / FileMaker風検索モード）で共有する検索フィールド定義 */
import {
  BICYCLE_OPTIONS,
  CASE_STATUS_OPTIONS,
  CREDITOR_STATUS_OPTIONS,
  DEBT_ADJUSTMENT_TYPE_OPTIONS,
  PAYMENT_DELAY_OPTIONS,
  PENSION_OPTIONS,
  PREFECTURE_OPTIONS,
  ACCEPTANCE_RANK_OPTIONS,
  CAUTION_RANK_OPTIONS,
  RESPONSE_STATUS_OPTIONS,
  LIST_CATEGORY_OPTIONS,
  OTHER_OFFICE_CONSULTATION_OPTIONS,
  WITHIN_TEN_DAYS_OPTIONS,
  REPAYMENT_TARGET_OPTIONS,
  FUND_INCREASE_ACTION_OPTIONS,
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
  { field: 'cautionRank', label: '要注意ランク', type: 'choice', options: CAUTION_RANK_OPTIONS },
  { field: 'acceptanceRank', label: '受任ランク', type: 'choice', options: ACCEPTANCE_RANK_OPTIONS },
  { field: 'appointmentStaff', label: 'アポ担当' },
  { field: 'interviewStaff', label: '面談担当' },
  { field: 'judicialScrivener', label: '担当司法書士' },
  { field: 'employerName', label: '勤務先' },
  { field: 'listCategory', label: 'リスト区分', type: 'choice', options: LIST_CATEGORY_OPTIONS },
  { field: 'creditorName', label: '債権者名', type: 'creditor' },
  // 債権者別ステータス（債権者1社ごとの進捗）。案件の「受任後ステータス」とは別項目。
  {
    field: 'creditorStatus',
    label: '債権者別ステータス',
    type: 'choice',
    options: CREDITOR_STATUS_OPTIONS,
  },
  // 入金明細（入金情報テーブル）の日付・差異。取込直後のチェックに使う。
  { field: 'paymentActualDate', label: '実入金日（入金明細）', type: 'date' },
  { field: 'paymentPlannedDate', label: '入金予定日（入金明細）', type: 'date' },
  // kintone の入金情報サブテーブルのチェックボックス。
  // ビュー「受任後入金管理」の絞り込みに使われている。
  { field: 'paymentCheck', label: '入金check（入金情報）' },
  {
    field: 'paymentAmountMismatch',
    label: '額（予定と実入金の差異）',
    type: 'choice',
    options: ['差異あり', '差異なし'],
  },
  { field: 'paymentRepaymentDate', label: '弁済日（入金明細）', type: 'date' },
  {
    field: 'paymentRepaymentMismatch',
    label: '確認（弁済の予定と実績の差異）',
    type: 'choice',
    options: ['差異あり', '差異なし'],
  },
  // 債権者の支払開始日（和解内容詳細の「支払開始月」。中身は年月日）。
  // 「◯月以前に支払いが始まる債権者を持つ案件」の抽出に使う。
  { field: 'creditorPaymentStartMonth', label: '支払開始月（債権者）', type: 'date' },
  // 債権者の CHECK 欄（kintone の和解対象債権一覧の CHECK）。
  // 「CHECK」を選ぶとチェック済みの債権者を持つ案件、「--」でチェック無しの案件。
  { field: 'creditorCheck', label: 'CHECK（債権者）', type: 'choice', options: ['CHECK', '--'] },
  { field: 'declaredDebtAmount', label: '申告債務額', type: 'number' },
  { field: 'payDay', label: '給与日' },
  { field: 'vAccountBranch', label: 'V口座-支店' },
  { field: 'vAccountNumber', label: 'V口座-番号' },
  { field: 'basePaymentAmount', label: '基本入金額', type: 'number' },
  { field: 'resignationDate', label: '辞任日', type: 'date' },
  { field: 'elapsedDays', label: '経過日数', type: 'number' },
  { field: 'cAcceptancePromotionDate', label: 'C受任昇格日', type: 'date' },
  { field: 'age', label: '年齢', type: 'number' },
  { field: 'installmentCount', label: '報酬分割回数', type: 'number' },
  { field: 'firstPaymentWithinTenDays', label: '10日以内', type: 'choice', options: WITHIN_TEN_DAYS_OPTIONS },
  { field: 'creditorResponseStatus', label: '回答状況（債権者）', type: 'choice', options: RESPONSE_STATUS_OPTIONS },
  { field: 'creditorRepaymentTarget', label: '弁済対象（債権者）', type: 'choice', options: REPAYMENT_TARGET_OPTIONS },
  // 原資UP対応（債権者ごと）。1社でも該当すればその案件がヒットする。
  { field: 'creditorFundIncreaseAction', label: '原資UP対応（債権者）', type: 'choice', options: FUND_INCREASE_ACTION_OPTIONS },

  // ── 債権者側の日付（修正依頼㉑「今月完済の人を絞りたい」）──
  // 完済は「最後の1社が終わったとき」なので、案件全体の最終と、
  // 1社でも該当すればヒットする条件を分けてある。
  { field: 'caseFinalPaymentDate', label: '最終支払日（全社完了＝完済日）', type: 'date' },
  // 完済日が出せない案件を洗い出すための条件。
  // 和解済なのに支払予定が入っていない社があると完済日が確定しないため、
  // その案件をここで拾って債権者名の読み替え作業の対象にできる。
  { field: 'caseFinalPaymentUnknown', label: '完済日が未確定（和解済なのに支払予定が無い社あり）', type: 'choice', options: ['該当する', '該当しない'] },
  { field: 'creditorFinalPaymentMonth', label: '最終支払日（いずれかの債権者）', type: 'date' },
  { field: 'creditorPaymentStartMonth', label: '支払開始日（債権者）', type: 'date' },
  { field: 'creditorSettlementDate', label: '和解日（債権者）', type: 'date' },
  { field: 'creditorSettlementProposalDate', label: '和解提案日（債権者）', type: 'date' },
  { field: 'creditorAcceptanceNoticeSentDate', label: '受任通知送付日（債権者）', type: 'date' },
  { field: 'creditorDebtInquiryArrivalDate', label: '債権調査到着日（債権者）', type: 'date' },
  { field: 'creditorContractDate', label: '調査票_契約日（債権者）', type: 'date' },
  { field: 'creditorNextProcessDate', label: '次回処理日時（債権者）', type: 'date' },
  { field: 'otherOfficeConsultation', label: '他事務所相談', type: 'choice', options: OTHER_OFFICE_CONSULTATION_OPTIONS },
  { field: 'preRequestPayment', label: '依頼前 返済額', type: 'number' },
  { field: 'postRequestPayment', label: '依頼後 返済額', type: 'number' },
  { field: 'uncollectedFee', label: '報酬未回収額', type: 'number' },
  { field: 'creditorCount', label: '債権社数', type: 'number' },
  // 「新規入力漏れチェック」で空欄を洗い出すために追加した項目
  { field: 'paymentDelay', label: '遅れ', type: 'choice', options: PAYMENT_DELAY_OPTIONS },
  { field: 'bicycleNote', label: '自転車', type: 'choice', options: BICYCLE_OPTIONS },
  { field: 'pension', label: '年金', type: 'choice', options: PENSION_OPTIONS },
  { field: 'lineUrl', label: 'LINE@ URL' },
  { field: 'settlementProposalDate', label: '和解提案予定日', type: 'date' },
  { field: 'postSettlementPaymentCount', label: '和解後代弁社数', type: 'number' },
  { field: 'nextPaymentDate', label: '次回入金日', type: 'date' },
  // 「報酬・弁代・プールチェック」で使う金額項目（一覧の追加列と対応）
  { field: 'officeFee', label: '事務所報酬（通常）', type: 'number' },
  { field: 'cumulativePlannedFeeAllocation', label: '累)報酬充当予定額', type: 'number' },
  { field: 'plannedPaymentFeeTotal', label: '予定弁済報酬総額', type: 'number' },
  {
    field: 'cumulativePlannedAgentFeeAllocation',
    label: '累)弁代報酬充当予定額',
    type: 'number',
  },
  { field: 'cumulativePlannedPoolAllocation', label: '累)ﾌﾟｰﾙ充当予定額', type: 'number' },
  { field: 'cumulativeHandlingFee', label: '累)手数料', type: 'number' },
  { field: 'cumulativePlannedPayment', label: '累)入金予定額', type: 'number' },
  { field: 'cumulativePaymentAmount', label: '累)入金金額', type: 'number' },
  { field: 'cumulativeFeeAllocation', label: '累)報酬充当額', type: 'number' },
  { field: 'cumulativeAgentFeeAllocation', label: '累)弁代報酬充当額', type: 'number' },
  { field: 'cumulativePoolAllocation', label: '累)ﾌﾟｰﾙ充当額', type: 'number' },
  { field: 'cumulativePlannedRepaymentAllocation', label: '累)弁済充当予定額', type: 'number' },
  { field: 'cumulativeRepaymentAllocation', label: '累)弁済充当額', type: 'number' },
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
