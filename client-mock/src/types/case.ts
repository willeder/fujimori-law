/**
 * 受任案件管理システム - 型定義
 * 参照: docs/spec/モックアプリ開発仕様_司法書士法人第一法務事務所.md（あれば）
 */

/** 依頼者基本情報 */
export interface ClientBasicInfo {
  name: string | null
  furigana: string | null
  phone: string | null
  lineUrl?: string | null // LINE@ URL
  email: string | null
  prefecture: string | null
  address: string | null
  birthDate: string | null
  age: number | null
  gender: '男' | '女' | null
  maritalStatus: '既婚' | '未婚' | '離婚' | null
  children: string | null
  residenceType: string | null // 持家(ﾛｰﾝ無)、持家(ﾛｰﾝ有)、賃貸、社宅、実家 等
  rent: number | null
  monthlyIncome: number | null
  payDay: string | null
  employmentType: string | null // 会社員・公務員、バイト(パート)・派遣、自営・会社経営、無職 等
  cautionRank: 'A' | 'B' | 'C' | null // 要注意ランク
}

/** アポ・後確・面談情報 */
export interface AppointmentInfo {
  appointmentStaff: string | null // アポ担当
  followUpStaff: string | null // 後確担当
  interviewStaff: string | null // 面談担当
  judicialScrivener: string | null // 担当司法書士
  debtAdjustmentType: '任意整理' | '自己破産' | '個人再生' | null // 債務整理区分
  acceptanceRank: 'A' | 'B' | 'C' | null // 受任ランク
  acceptanceDate: string | null // 受任日
  elapsedDays: number | null // 経過日数
}

/** 債務情報 */
export interface DebtInfo {
  creditorCount: number | null // 債権社数
  declaredDebtAmount: number | null // 申告債務額
  totalDebtAmount: number | null // 債務額総額
  preRequestPayment: number | null // 依頼前返済額
  postRequestPayment: number | null // 依頼後返済額
}

/** 和解情報 */
export interface SettlementInfo {
  status: string | null // 受任後ステータス（全和解済_支払中、資格者面談待ち、キャンセル等）
  proposalDate: string | null // 和解提案予定日
  settlementCount: number | null // 和解弁済総数
  postSettlementPaymentCount: number | null // 和解後代弁社数
  plannedPaymentCount: number | null // 予定弁済総数
  plannedAgentCount: number | null // 予定代弁社数
  allSettlementDocSentDate: string | null // 全和解書送付日
}

/** 報酬情報 */
export interface FeeInfo {
  normalFee: number | null // 通常報酬
  officeFee: number | null // 事務所報酬（通常）
  installmentCount: number | null // 報酬分割回数
  agentPayment: string | null // 弁済代行（あり/なし）
  plannedPaymentFeeTotal: number | null // 予定弁済報酬総額
  uncollectedFee: number | null // 報酬未回収額
}

/** 入金情報 */
export interface PaymentInfo {
  firstPaymentDate: string | null // 初回入金予定日
  firstPaymentAmount: number | null // 初回入金額
  monthlyPaymentDay: string | null // 毎月入金日
  basePaymentAmount: number | null // 基本入金額
  nextPaymentDate: string | null // 次回入金日
  cumulativePaymentAmount: number | null // 累)入金金額
  cumulativePlannedPayment: number | null // 累)入金予定額
  cumulativeFeeAllocation: number | null // 累)報酬充当額
  cumulativePlannedFeeAllocation: number | null // 累)報酬充当予定額
  cumulativePoolAllocation: number | null // 累)プール充当額
  cumulativeRepaymentAllocation: number | null // 累)弁済充当額
  totalMinusPoolMinusRepayment: number | null // 総額-プール-累弁済
}

/** リマインド情報 */
export interface ReminderInfo {
  reminderDate: string | null
  reminderTime: string | null
  nextResponseDate: string | null
  responseTime: string | null
}

/** メタデータ */
export interface CaseMetadata {
  createdAt: string | null
  updatedAt: string | null
  createdBy: string | null
  updatedBy: string | null
  externalId?: string | null // ID（kintone等の外部ID想定）
  listCategory?: string | null // リスト区分
  listRegisteredDate?: string | null // リスト登録日
  acceptanceDocs?: string | null // 受任資料（リンク/ファイル名のメモ）
}

/** 案件（統合データ） */
export interface Case {
  id: number
  clientBasicInfo: ClientBasicInfo
  appointmentInfo: AppointmentInfo
  debtInfo: DebtInfo
  settlementInfo: SettlementInfo
  feeInfo: FeeInfo
  paymentInfo: PaymentInfo
  reminderInfo: ReminderInfo
  metadata: CaseMetadata
}

/** 債権者別ステータス */
export type CreditorStatus =
  | '受任通知発送待ち'
  | '受任通知発送済'
  | '債権調査中'
  | '和解提案中'
  | '和解済'
  | '弁済中'
  | '完済'

/** 債権者情報（和解対象債権） */
export interface Creditor {
  id: number
  caseId: number
  creditorName: string // 債権者名（楽天、セゾン、アコム等）
  negotiationPartner: string | null // 交渉相手
  declaredAmount: number | null // 申告額
  debtAmount: number | null // 債務額
  expectedSettlement: number | null // 想定和解
  status: CreditorStatus
  nextProcessDate: string | null // 次回処理日時
  acceptanceNoticeSentDate: string | null // 受任通知送付日
  debtInquiryArrivalDate: string | null // 債権調査到着日
  customerCode: string | null // 顧客コード
  contractDate: string | null // 調査票_契約日
  settlementProposalDate: string | null // 和解提案日
  responseStatus?: string | null // 回答状況
  settlementDate: string | null // 和解日
  settlementAmount: number | null // 和解金額（= 和解）
  settlementDebtAmount?: number | null // 和解時債務金額
  settlementContentComment?: string | null // 和解内容コメント
  creditorDocuments?: string | null // 債権者資料（リンク/ファイル名のメモ）
  paymentStartMonth: string | null // 支払開始月
  paymentDay: number | null // 支払日
  paymentCount: number | null // 支払回数
  firstPaymentAmount: number | null // 初回支払額
  subsequentPaymentAmount: number | null // ２回目以降支払額
  finalPaymentAmount: number | null // 最終支払額
  finalPaymentMonth: string | null // 最終支払月
  futureInterest: string | null // 将来利息
  bankName: string | null // 振込先銀行名
  branchName: string | null // 振込先支店名
  accountType: string | null // 振込先口座種別
  accountNumber: string | null // 振込先口座番号
  accountHolder: string | null // 振込先口座名義
}

/** 入金予定/実績 */
export interface PaymentRecord {
  id: number
  caseId: number
  /** 未設定・null = 案件全体の入金。数値 = 当該債権者の弁済スケジュール行 */
  creditorId?: number | null
  /** 債権者別行のみ。和解上の支払回次（第1回・第2回…） */
  creditorInstallmentIndex?: number | null
  plannedDate: string | null // 入金予定日
  plannedAmount: number | null // 入金予定額
  plannedFeeAllocation: number | null // 報酬充当予定額
  plannedAgentFeeAllocation: number | null // 弁代報酬充当予定額
  plannedPoolAllocation: number | null // プール充当予定額
  plannedRepaymentAllocation: number | null // 弁済充当予定額
  actualDate: string | null // 実入金日
  actualAmount: number | null // 実入金額
  actualFeeAllocation: number | null // 報酬充当額
  actualAgentFeeAllocation: number | null // 弁代報酬充当額
  actualPoolAllocation: number | null // プール充当額
  actualRepaymentAllocation: number | null // 弁済充当額
  handlingFee: number | null // 手数料
  repaymentCount: number | null // 弁済社数
  cumulativePool: number | null // 累積プール
}

/** 接触履歴 */
export interface ContactHistory {
  id: number
  caseId: number
  contactDate: string | null
  contactTime: string | null
  staff: string | null
  tool: string | null // LINE、電話、メール等
  targetType: '依頼者' | '債権者'
  creditorName?: string | null // 債権者の場合
  comment: string | null
}
