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
  postalCode?: string | null // 郵便番号
  prefecture: string | null
  address: string | null
  birthDate: string | null
  age: number | null
  gender: '男' | '女' | null
  maritalStatus: '既婚' | '未婚' | '離婚' | null
  maidenName?: string | null // 旧姓
  children: string | null
  residenceType: string | null // 持家(ﾛｰﾝ無)、持家(ﾛｰﾝ有)、賃貸、社宅、実家 等
  rent: number | null
  monthlyIncome: number | null
  payDay: string | null
  employmentType: string | null // 会社員・公務員、バイト(パート)・派遣、自営・会社経営、無職 等
  cautionRank: 'A' | 'B' | 'C' | null // 要注意ランク
  /** kintone 等の依頼者レコード番号 */
  recordNumber?: number | null
  /** 対応要否 */
  correspondenceRequired?: string | null
  /** 対応時間 */
  correspondenceHours?: string | null
  /** 同居 */
  cohabitation?: string | null
  /** 内密先 */
  confidentialContact?: string | null
  /** 緊急連絡先 */
  emergencyContact?: string | null
  /** 関係（緊急） */
  emergencyContactRelation?: string | null
  /** 旧住所 */
  previousAddress?: string | null
  /** 給与口座 */
  payrollAccount?: string | null
  /** 勤務先名 */
  employerName?: string | null
  /** 勤務先連絡先 */
  employerContact?: string | null
  /** 勤務先住所 */
  employerAddress?: string | null
  /** 旧)勤務先名 */
  previousEmployerName?: string | null
  /** 旧)勤務連絡先 */
  previousEmployerContact?: string | null
  /** 旧)勤務先住所 */
  previousEmployerAddress?: string | null
  /** 他事務所相談 */
  otherOfficeConsultation?: string | null
  /** 遅れ（返済遅延等のメモ） */
  paymentDelay?: string | null
  /** 自転車（ローン等のメモ） */
  bicycleNote?: string | null
  /** 年金 */
  pension?: string | null
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
  /** C受任昇格日 */
  cAcceptancePromotionDate: string | null
  /** 面談時備考１ */
  interviewMemo1: string | null
  /** 面談時備考２ */
  interviewMemo2: string | null
  /** 収支メモ */
  incomeExpenseMemo: string | null
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
  /** 初回入金が受任から10日以内か等（シート表記に合わせて文字列で保持） */
  firstPaymentWithinTenDays: string | null
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
  cumulativePlannedRepaymentAllocation: number | null // 累)弁済充当予定額
  cumulativePlannedPoolAllocation: number | null // 累)ﾌﾟｰﾙ充当予定額
  cumulativeAgentFeeAllocation: number | null // 累)弁代報酬充当額
  cumulativePlannedAgentFeeAllocation: number | null // 累)弁代報酬充当予定額
  cumulativeHandlingFee: number | null // 累)手数料
  totalMinusPoolMinusRepayment: number | null // 総額-プール-累弁済
  /** 催促通知除外: '除外' | null */
  notificationExcluded: '除外' | null
  /** バーチャル口座（略称V口座。登録後は原則ロック。変更時は確認ダイアログ） */
  vAccountBranch: string | null // 支店
  vAccountNumber: string | null // 口座番号
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
  updatedAtExact?: string | null // 楽観ロック（先勝ち保存）用の厳密な更新時刻（ISO・ミリ秒）
  createdBy: string | null
  updatedBy: string | null
  externalId?: string | null // ID（kintone等の外部ID想定）
  listCategory?: string | null // リスト区分
  listRegisteredDate?: string | null // リスト登録日
  acceptanceDocs?: string | null // 受任資料（リンク/ファイル名のメモ）
  lineLinked?: boolean // LINE連携済み（サマリ用・LINKEDなら true）
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
  | '債権調査票待ち'
  | '求償先調査票待ち'
  | '和解提案書作成待ち'
  | '和解提案書発送待ち'
  | '和解提案書発送済'
  | '和解稟議中'
  | '和解済'
  | '弁護士和解済 返済中'
  | '和解後完済済'
  | '破産申立待ち'
  | '破産申立済'
  | '弁護士引継ぎ待ち'
  | '弁護士引継ぎ済'
  | '受任対象外'

/** 弁済除外ステータス */
/** 債権者情報（和解対象債権） */
export interface Creditor {
  id: number
  caseId: number
  creditorName: string // 債権者名（楽天、セゾン、アコム等）
  negotiationPartner: string | null // 交渉相手
  declaredAmount: number | null // 申告額
  debtAmount: number | null // 債務額
  expectedSettlement: number | null // 想定和解（%）
  expectedSettlementAmount: number | null // 和解予定額（金額）
  expectedPaymentCount: number | null // 和解予定回数
  expectedFutureInterest: string | null // 和解予定利息
  status: CreditorStatus
  displayOrder?: number | null // タブ/一覧の表示順（受任→受任対象外）
  check?: string | null // CHECK
  nextProcessDate: string | null // 次回処理日時
  acceptanceNoticeSentDate: string | null // 受任通知送付日
  debtInquiryArrivalDate: string | null // 債権調査到着日
  customerCode: string | null // 顧客コード
  contractDate: string | null // 調査票_契約日
  settlementProposalDate: string | null // 和解提案日
  settlementProposal?: number | null // 和解提案
  responseStatus?: string | null // 回答状況
  settlementDate: string | null // 和解日
  settlementAmount: number | null // 和解金額（= 和解）
  settlementDebtAmount?: number | null // 和解時債務金額
  settlementContentComment?: string | null // 和解内容コメント
  reminder?: string | null // リマインド
  creditorDocuments?: string | null // 債権者資料（リンク/ファイル名のメモ）
  paymentStartMonth: string | null // 支払開始日（YYYY-MM-DD。列名は従来踏襲だが中身は年月日）
  paymentDay: number | null // 支払日（廃止予定。約定日は支払開始日から導出。データ互換のため列は残置）
  paymentCount: number | null // 支払回数
  firstPaymentAmount: number | null // 初回支払額
  subsequentPaymentAmount: number | null // ２回目以降支払額
  finalPaymentAmount: number | null // 最終支払額
  finalPaymentMonth: string | null // 最終支払日（YYYY-MM-DD。列名は従来踏襲だが中身は年月日）
  futureInterest: string | null // 将来利息
  bankName: string | null // 振込先銀行名
  financialInstitutionCode?: string | null // 金融機関コード
  branchName: string | null // 振込先支店名
  branchCode?: string | null // 支店コード
  accountType: string | null // 振込先口座種別
  accountNumber: string | null // 振込先口座番号
  accountHolder: string | null // 振込先口座名義
  designatedCode?: string | null // 指定コード
  repaymentTarget?: string | null // 弁済対象
  memo?: string | null // メモ
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
  handlingFee: number | null // 手数料（予定）
  repaymentCount: number | null // 社数（予定）
  repaymentDate: string | null // 弁済日（実績）
  actualRepaymentCount: number | null // 数（実績の社数）
  actualHandlingFee: number | null // 振)手数料（実績の手数料）
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

/** 弁済対象ステータス */
export type RepaymentStatus = 'active' | 'suspended' | 'completed' | null

/** 入金遅延統計 */
export interface PaymentDelayStats {
  caseId: number
  totalPayments: number // 総入金回数
  delayedPayments: number // 遅延回数
  delayRate: number // 遅延率 (0-1)
  consecutiveDelays: number // 連続遅延回数
  lastDelayDate: string | null // 最後の遅延日
  riskLevel: 'low' | 'medium' | 'high' // 遅延リスク
  avgDelayDays: number // 平均遅延日数
}

/** LINE通知設定 */
export interface LineNotificationConfig {
  enabled: boolean
  reminderDaysBefore: number[] // [7, 3, 1] = 7日前、3日前、1日前
  sendTime: string // "10:00" 送信時刻
}

/** LINE通知履歴 */
export interface LineNotificationLog {
  id: number
  caseId: number
  notificationType: 'payment_reminder' | 'deposit_confirm' | 'deadline_alert'
  scheduledDate: string
  sentDate: string | null
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  recipientLineUserId?: string | null
  messageContent: string
  errorMessage?: string | null
}

/** 遅延案件情報（ダッシュボード表示用） */
export interface DelayedCaseInfo {
  case: Case
  stats: PaymentDelayStats
  overduePayments: PaymentRecord[]
}
