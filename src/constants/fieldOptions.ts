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
// kintone のビュー「弁代代行対象」の条件と同一にすること。
// 「資格者面談待ち」は以前こちらの判断で外していたが、kintone では対象に含まれていた。
export const GMO_TRANSFER_TARGET_STATUSES = [
  '受任通知発送待ち',
  '全社受任通知発送済',
  '一部受任通知発送済',
  '資格者面談待ち',
  '全和解済_支払中',
] as const

/** 債権者ステータス（Creditor.status） */
/**
 * 債権者ステータス。**kintone のフォーム定義（アプリ4）と同一**にすること。
 * 値も並び順もここを正とし、独自の追加はしない。
 * 事務所から追加のご要望が出た場合は、まず kintone 側に足していただき、
 * そのうえでここへ反映する（先に足すと取込時に食い違うため）。
 *
 * 現時点で未反映のご要望（藤川様 2026-08-08）:
 *   和解提案書作成済 / 援用通知作成待ち / 援用通知発送待ち / 援用通知発送済
 *   → kintone 側に追加されしだい、ここにも追加する。
 */
/**
 * 原資UP対応（債権者ごと）。
 *
 * 事務所の運用（2026-09-02）:
 *   申告額より実債務額が大きい社が出たとき、依頼者と話して弁済原資を上げる。
 *   その要否と完了を債権者ごとに残し、案件単位のまとめは各社の値から出す。
 *
 * 空欄（NULL）が既定。kintone からの移行分は全件空欄。
 */
export const FUND_INCREASE_ACTION_OPTIONS = ['要', '完了'] as const

export const CREDITOR_STATUS_OPTIONS = [
  '受任通知発送待ち',
  '債権調査票待ち',
  '求償先調査票待ち',
  '和解提案書作成待ち',
  // ↓ kintone には無い。事務所のご要望で追加（修正依頼①・藤川様）
  '和解提案書作成済',
  '和解提案書発送待ち',
  '和解提案書発送済',
  '和解再提案待ち',
  '和解稟議中',
  '和解済',
  '和解後返済中',
  '和解後完済済',
  '弁護士引継ぎ待ち',
  '弁護士引継ぎ済',
  '弁護士和解済 返済中',
  '破産申立済',
  '破産申立待ち',
  // ↓ kintone には無い。時効援用の進行を債権者ごとに追えるように追加
  //   （修正依頼①・藤川様。案件側の「債務整理方法＝時効援用」に対応する）
  '援用通知作成待ち',
  '援用通知発送待ち',
  '援用通知発送済',
  // kintone には無いが、相談票取込で「受任対象外」の債権者を保持するために必要
  '受任対象外',
] as const

/**
 * 和解が成立していて弁済の対象になる債権者ステータス。
 * GMO振込の対象判定・「和解済み◯社」の集計はこれで判断する。
 * （旧「和解済 / 弁済中 / 完済」に相当。kintone の値に合わせて置き換えた）
 */
export const SETTLED_CREDITOR_STATUSES = [
  '和解済',
  '和解後返済中',
  '弁護士和解済 返済中',
  '和解後完済済',
] as const

/**
 * 受任ランク（Case.acceptanceRank）。
 * kintone の実データには「C通常」が280件ある。取込の許可リストから漏れていて
 * 全件 null になっていたため、選択肢・取込の両方に追加した。
 */
export const ACCEPTANCE_RANK_OPTIONS = ['A', 'B', 'C', 'C通常'] as const

/**
 * 要注意ランク（Case.cautionRank）。
 * kintone の実データには「S」が32件ある（受任ランクには無い）。
 * 受任ランクとは選択肢が違うので別々に持つ。
 */
export const CAUTION_RANK_OPTIONS = ['S', 'A', 'B', 'C'] as const

/** @deprecated 受任・要注意で選択肢が異なるため、上の2つを使う */
export const RANK_OPTIONS = ['A', 'B', 'C'] as const

/** 遅れ（Case.paymentDelay） */
export const PAYMENT_DELAY_OPTIONS = ['あり', 'なし'] as const

/** 自転車（Case.bicycleNote） */
export const BICYCLE_OPTIONS = ['あり', 'なし'] as const

/** 年金（Case.pension） */
export const PENSION_OPTIONS = ['未受給', '受給中', '受給予定'] as const

/** 債務整理区分（Case.debtAdjustmentType） */
export const DEBT_ADJUSTMENT_TYPE_OPTIONS = [
  '任意整理',
  '自己破産',
  '個人再生',
  '過払金請求',
  '時効援用',
] as const

/** 性別（Case.gender） */
export const GENDER_OPTIONS = ['男', '女', '不明'] as const

/** 婚姻状況（Case.maritalStatus） */
export const MARITAL_STATUS_OPTIONS = ['未婚', '既婚', '離婚', '死別'] as const

/** 居住形態（Case.residenceType） */
export const RESIDENCE_TYPE_OPTIONS = [
  '持家(ﾛｰﾝ有)',
  '持家(ﾛｰﾝ無)',
  '賃貸',
  '実家',
  '社宅',
] as const

/** 勤務形態（Case.employmentType） */
export const EMPLOYMENT_TYPE_OPTIONS = [
  '会社員・公務員',
  'バイト(パート)・派遣',
  '自営・会社経営',
  '専業主婦・家事手伝い',
  '学生',
  '無職',
] as const

/** あり／なし（弁済代行・将来利息など） */
export const YES_NO_OPTIONS = ['あり', 'なし'] as const

/** 弁済対象（Creditor.repaymentTarget）。空欄＝弁済対象。停止／終了は対象外 */
export const REPAYMENT_TARGET_OPTIONS = ['停止', '終了', '変則'] as const

/** 回答状況（Creditor.responseStatus） */
export const RESPONSE_STATUS_OPTIONS = ['待ち', '保留', '受理'] as const

/** リスト区分（Case.listCategory） */
export const LIST_CATEGORY_OPTIONS = [
  '共同①',
  '共同②',
  '共同③',
  '共同④',
  'アンブレロ',
  '円陣',
  'ヤマト',
  'わたこり',
  'コナトス',
  'ファーストエディション',
  'サムライアドウェイズ',
] as const

/** 他事務所相談（Case.otherOfficeConsultation） */
export const OTHER_OFFICE_CONSULTATION_OPTIONS = [
  '依頼なし',
  '依頼歴あり',
  '依頼中',
  '依頼済',
  '未聴取',
] as const

/** 10日以内（Case.firstPaymentWithinTenDays） */
export const WITHIN_TEN_DAYS_OPTIONS = ['〇', '×'] as const

/** 対応要否（Case.correspondenceRequired） */
export const CORRESPONDENCE_REQUIRED_OPTIONS = ['対応停止'] as const

/**
 * 接触履歴のツール。依頼者と債権者で選択肢が違う（kintone のフォーム定義どおり）。
 * 以前は共通の LINE/電話/メール/SMS/その他 だったため、実データにある
 * 固定・郵送・zoom フォン・携帯・FAX が選べなかった。
 */
export const CONTACT_TOOL_CLIENT_OPTIONS = [
  '携帯',
  '固定',
  'zoom フォン',
  'LINE',
  'メール',
  'SMS',
  'FAX',
  '郵送',
] as const
export const CONTACT_TOOL_CREDITOR_OPTIONS = ['固定', '携帯', '郵送', 'FAX'] as const

/**
 * 担当者。kintone のフォーム定義から取得。
 * 退職などで選択肢から外れた担当者が既存データに残っているため、
 * 入力欄では「現在値が選択肢に無ければ先頭に足す」処理を入れてある
 * （EditableField 参照）。過去の記録が消えないようにするため。
 */
export const CONTACT_STAFF_OPTIONS = [
  '土橋満', '三田村恭瑛', '中川晃行', '森武', '竹谷香乃', '赤松瑠果',
  '大瀧　瑛一', '園山啓太', '森下真司', '前田　菜奈美', '宮武　愛海',
  '石原　暉', '宮川綾奈', '堀本和代', '藤川拓己', '藤原恵利',
] as const

export const APPOINTMENT_STAFF_OPTIONS = [
  '三田村　恭瑛', '森　武', '赤松　瑠果', '大瀧　瑛一', '園山　啓太',
  '森下　真司', '宮武　愛海', '石原　暉', '末原　理央', '朝田　楓花',
  '大石　加奈子', '川越　紗耶加', '内山　瞳', '紹介',
] as const

export const FOLLOW_UP_STAFF_OPTIONS = [
  '三田村　恭瑛', '森　武', '赤松　瑠果', '竹谷　香乃', '大瀧　瑛一',
  '園山　啓太', '森下　真司', '宮武　愛海', '石原　暉', '末原　理央',
  '朝田　楓花', '大石　加奈子', '川越　紗耶加', '内山　瞳', '宮川　綾奈',
  '堀本　和代', '藤川　拓己', '藤原　恵利', '即アポ', '土橋　満',
] as const

export const INTERVIEW_STAFF_OPTIONS = [
  '三田村　恭瑛', '森　武', '赤松　瑠果', '大瀧　瑛一', '園山　啓太',
  '森下　真司', '宮武　愛海', '石原　暉',
] as const

export const JUDICIAL_SCRIVENER_OPTIONS = ['中川　晃行'] as const

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
