/**
 * 選択肢マスタ。
 *
 * 以前は受任後ステータスや各ランクの選択肢が画面ごとにベタ書きされており、
 * 画面によって選択肢が食い違っていた（例: ステータスの「辞任」が一部画面に無い、
 * 債権者ステータスの「受任対象外」が一部画面に無い）。
 * 選択肢を増減するときはこのファイルだけを直せば、入力欄・絞り込み・バッジ色の
 * すべてに反映される。
 *
 * 値は DB にそのまま入る文字列なので、**既存データと一致させること**。
 * 表記を変える場合は必ずデータ移行とセットで行う。
 */

/** 受任後ステータス（Case.settlementStatus） */
export const CASE_STATUS_OPTIONS = [
  '受任通知発送待ち',
  '全社受任通知発送済',
  '一部受任通知発送済',
  '破産申立待ち',
  '破産申立済',
  '免責済',
  'キャンセル',
  'キャンセル（要報酬回収）',
  '辞任',
  '辞任（報酬回収後）',
  '辞任（要報酬回収）',
  '資格者面談待ち',
  '全和解済_支払中',
  '全和解済_完済',
] as const

/**
 * GMO一括振込（弁済代行）の対象になる受任後ステータス。
 * ここに無いステータス（破産手続中・免責済・キャンセル・辞任・資格者面談待ち・
 * 全和解済_完済）の案件は、弁済がもう発生しないため振込データに含めない。
 */
export const GMO_TRANSFER_TARGET_STATUSES = [
  '受任通知発送待ち',
  '全社受任通知発送済',
  '一部受任通知発送済',
  '全和解済_支払中',
] as const

/** 債権者ステータス（Creditor.status） */
export const CREDITOR_STATUS_OPTIONS = [
  '受任通知発送待ち',
  '債権調査票待ち',
  '求償先調査票待ち',
  '和解提案書作成待ち',
  '和解提案書発送待ち',
  '和解提案書発送済',
  '和解再提案待ち',
  '和解稟議中',
  '和解済',
  '弁護士和解済 返済中',
  '和解後完済済',
  '破産申立待ち',
  '破産申立済',
  '弁護士引継ぎ待ち',
  '弁護士引継ぎ済',
  '受任対象外',
] as const

/**
 * 和解が成立していて弁済の対象になる債権者ステータス。
 * GMO振込の対象判定・「和解済み◯社」の集計はこれで判断する。
 * （旧「和解済 / 弁済中 / 完済」に相当。kintone の値に合わせて置き換えた）
 */
export const SETTLED_CREDITOR_STATUSES = [
  '和解済',
  '弁護士和解済 返済中',
  '和解後完済済',
] as const

/** 受任ランク / 要注意ランク（Case.acceptanceRank / Case.cautionRank） */
export const RANK_OPTIONS = ['A', 'B', 'C'] as const

/** 遅れ（Case.paymentDelay） */
export const PAYMENT_DELAY_OPTIONS = ['あり', 'なし'] as const

/** 自転車（Case.bicycleNote） */
export const BICYCLE_OPTIONS = ['あり', 'なし'] as const

/** 年金（Case.pension） */
export const PENSION_OPTIONS = ['未受給', '受給中', '受給予定'] as const

/** 債務整理区分（Case.debtAdjustmentType） */
export const DEBT_ADJUSTMENT_TYPE_OPTIONS = ['任意整理', '自己破産', '個人再生'] as const

/** 性別（Case.gender） */
export const GENDER_OPTIONS = ['男', '女'] as const

/** 婚姻状況（Case.maritalStatus） */
export const MARITAL_STATUS_OPTIONS = ['既婚', '未婚', '離婚'] as const

/** 居住形態（Case.residenceType） */
export const RESIDENCE_TYPE_OPTIONS = [
  '持家(ﾛｰﾝ無)',
  '持家(ﾛｰﾝ有)',
  '賃貸',
  '社宅',
  '実家',
] as const

/** 勤務形態（Case.employmentType） */
export const EMPLOYMENT_TYPE_OPTIONS = [
  '会社員・公務員',
  'バイト(パート)・派遣',
  '自営・会社経営',
  '無職',
] as const

/** あり／なし（弁済代行・将来利息など） */
export const YES_NO_OPTIONS = ['あり', 'なし'] as const

/** 口座種別（Creditor 振込先） */
export const ACCOUNT_TYPE_OPTIONS = ['普通', '当座'] as const

/** 都道府県（Case.prefecture） */
export const PREFECTURE_OPTIONS = [
  '北海道',
  '青森県',
  '岩手県',
  '宮城県',
  '秋田県',
  '山形県',
  '福島県',
  '茨城県',
  '栃木県',
  '群馬県',
  '埼玉県',
  '千葉県',
  '東京都',
  '神奈川県',
  '新潟県',
  '富山県',
  '石川県',
  '福井県',
  '山梨県',
  '長野県',
  '岐阜県',
  '静岡県',
  '愛知県',
  '三重県',
  '滋賀県',
  '京都府',
  '大阪府',
  '兵庫県',
  '奈良県',
  '和歌山県',
  '鳥取県',
  '島根県',
  '岡山県',
  '広島県',
  '山口県',
  '徳島県',
  '香川県',
  '愛媛県',
  '高知県',
  '福岡県',
  '佐賀県',
  '長崎県',
  '熊本県',
  '大分県',
  '宮崎県',
  '鹿児島県',
  '沖縄県',
] as const

/** 選択肢の文字列配列を EditableField 等が期待する {value,label} 形式に変換する */
export function toSelectOptions(
  values: readonly string[]
): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: v }))
}
