/**
 * CSVの列定義と見出しの付け方。**出力と取込で同じものを使う。**
 *
 * 出力（caseCsvExport）と取込（caseCsvImport）で見出しの作り方がずれると、
 * 「出したCSVをそのまま取り込めない」という一番困る壊れ方をする。
 * 以前は api/data.ts と vite.config.ts に同じ labelOf が写経されていたため、
 * 片方だけ直すと本番と開発で挙動が変わる状態だった。ここに集約する。
 *
 * 見出しの決まり（事務所と確認 2026-09-03）:
 *   ・突合用の内部IDは【案件ID】【債権者ID】のように【】で囲む。
 *     触ってはいけない列であること、取込の突合キーであることを見出しで示す。
 *   ・差額や累計など、他の値から計算して出している項目は［計算］を付ける。
 *     取込では読み飛ばすため、直しても反映されないことを見出しで示す。
 *   ・テーブルの項目は「債権者：和解金額」のように、テーブル名を前に付ける。
 *     案件側と同じ名前の項目（ステータス等）があるため。
 */
import { FIELD_LABEL } from './fieldLabels.js'

export type CsvTableKey = 'creditor' | 'payment' | 'contact'

export const CSV_TABLE_NAME: Record<CsvTableKey, string> = {
  creditor: '債権者',
  payment: '入金',
  contact: '接触履歴',
}

export const CSV_TABLE_ORDER: CsvTableKey[] = ['creditor', 'payment', 'contact']

/**
 * 他の値から計算して出している項目（DBに書き戻してはいけない）。
 *   difference     … 申告額 − 債務額
 *   cumulativePool … 累計プール
 *   elapsedDays    … 受任からの経過日数
 *   age            … 生年月日からの年齢
 */
export const CSV_CALCULATED = new Set(['difference', 'cumulativePool', 'elapsedDays', 'age'])

/** テーブルごとに出せる項目（DBの列名）。並びは schema.prisma の定義順に合わせてある */
export const CREDITOR_FIELDS = [
  'id', 'caseId', 'creditorName', 'negotiationPartner', 'declaredAmount', 'debtAmount',
  'expectedSettlement', 'expectedSettlementAmount', 'expectedPaymentCount', 'expectedFutureInterest',
  'status', 'check', 'nextProcessDate', 'acceptanceNoticeSentDate', 'debtInquiryArrivalDate',
  'customerCode', 'contractDate', 'settlementProposalDate', 'settlementProposal', 'responseStatus',
  'settlementDate', 'settlementAmount', 'settlementDebtAmount', 'settlementContentComment',
  'reminder', 'paymentStartMonth', 'paymentDay', 'paymentCount', 'firstPaymentAmount',
  'subsequentPaymentAmount', 'finalPaymentAmount', 'finalPaymentMonth', 'futureInterest',
  'bankName', 'financialInstitutionCode', 'branchName', 'branchCode', 'accountType',
  'accountNumber', 'accountHolder', 'designatedCode', 'repaymentTarget',
  'displayOrder',
]

export const PAYMENT_FIELDS = [
  'id', 'caseId', 'creditorId', 'creditorInstallmentIndex', 'plannedDate', 'plannedAmount',
  'plannedFeeAllocation', 'plannedAgentFeeAllocation', 'plannedPoolAllocation',
  'plannedRepaymentAllocation', 'actualDate', 'actualAmount', 'actualFeeAllocation',
  'actualAgentFeeAllocation', 'actualPoolAllocation', 'actualRepaymentAllocation',
  'handlingFee', 'repaymentCount', 'repaymentDate', 'actualRepaymentCount', 'actualHandlingFee',
  'cumulativePool', 'check',
]

export const CONTACT_FIELDS = [
  'id', 'caseId', 'contactDate', 'contactTime', 'staff', 'tool', 'targetType', 'creditorName', 'comment',
]

export const CSV_TABLE_FIELDS: Record<CsvTableKey, string[]> = {
  creditor: CREDITOR_FIELDS,
  payment: PAYMENT_FIELDS,
  contact: CONTACT_FIELDS,
}

/**
 * CSVの見出し文字列を作る。
 * @param kind  'case' か テーブルのキー
 * @param field 案件は道順（"clientBasicInfo.name"）、テーブルはDBの列名
 */
export function csvHeaderLabel(kind: string, field: string): string {
  const leaf = field.split('.').pop() ?? field
  const name = FIELD_LABEL[leaf] ?? leaf
  const tableName = CSV_TABLE_NAME[kind as CsvTableKey]
  if (leaf === 'id') return `【${kind === 'case' ? '案件ID' : `${tableName}ID`}】`
  const base = kind === 'case' ? name : `${tableName}：${name}`
  return CSV_CALCULATED.has(leaf) ? `${base}［計算］` : base
}

// ── 出力設定（項目の選択と並び）の保存 ──────────────────────
/**
 * CSV出力の「どの項目を・どの順で出すか」に名前を付けて保存する。
 *
 * 事務所からのご要望（田中様 2026-10-02）:
 *   「引き抜いた入金スケジュールのCSVの並び（予定日・予定額・予定弁代報酬充当 等）を
 *     kintone で取り出したCSVと同じ並びにしたい。kintone は出力順を変動・指定できる
 *     形なので同じように出力でき、その出力順などを保存できれば嬉しい」
 * 保存先は「保存した絞り込み条件」と同じ saved_filters テーブル（target で区別）。
 * 事務所の全員が、どのPCからでも同じ設定を使えるようにするため。
 */
export const CSV_LAYOUT_TARGET = 'csvExport'

export type CsvLayoutPayload = {
  version: 'csv1'
  /** 案件の項目（DataTable のCSV候補のキー。左から順）。null なら案件側は変えない */
  caseFields: string[] | null
  /** テーブルごとに出す項目（DBの列名。左から順）。含まれないテーブルは出さない */
  tables: Partial<Record<CsvTableKey, string[]>>
}

/**
 * 最初から用意しておく出力設定。
 *
 * 入金スケジュール（kintoneと同じ並び）:
 *   事務所が入金スケジュールの調整に使っている kintone のCSV（109540E 様の例、2026-10-02 受領）の
 *   列の並びに合わせた。kintone の列 → このシステムの項目:
 *     ID→ID / 入金予定日→予定日 / 入金予定額→予定額 / 報酬充当予定額→予定報酬充当 /
 *     弁代報酬充当予定額→予定弁代報酬充当 / ﾌﾟｰﾙ充当予定額→予定プール充当 / 社数→社数（予定） /
 *     手数料→手数料 / 弁済充当予定額→予定弁済充当 / 実入金日→実入金日 / 実入金額→実入金額 /
 *     報酬充当額→報酬充当 / 弁代報酬充当額→弁代報酬充当 / ﾌﾟｰﾙ充当額→プール充当 / 弁済日→弁済日 /
 *     数→社数（実績） / 振)手数料→振)手数料 / 弁済充当額→弁済充当 / check[check]→チェック /
 *     累積ﾌﾟｰﾙ→累計プール
 *   このシステムに無い kintone の列（レコードの開始行・--・累積[check]・相違・確認・額・
 *   入金check・実ﾌﾟｰﾙ）は出さない（2026-10-03 Rei 判断。要否は事務所に確認中）。
 *   【案件ID】【入金ID】は取込の突合に要るため、いつも先頭に付く。
 */
export const CSV_LAYOUT_PRESETS: { id: string; name: string; payload: CsvLayoutPayload }[] = [
  {
    id: 'preset:payment-kintone',
    name: '入金スケジュール（kintoneと同じ並び）',
    payload: {
      version: 'csv1',
      caseFields: ['field:metadata.externalId'],
      tables: {
        payment: [
          'plannedDate',
          'plannedAmount',
          'plannedFeeAllocation',
          'plannedAgentFeeAllocation',
          'plannedPoolAllocation',
          'repaymentCount',
          'handlingFee',
          'plannedRepaymentAllocation',
          'actualDate',
          'actualAmount',
          'actualFeeAllocation',
          'actualAgentFeeAllocation',
          'actualPoolAllocation',
          'repaymentDate',
          'actualRepaymentCount',
          'actualHandlingFee',
          'actualRepaymentAllocation',
          'check',
          'cumulativePool',
        ],
      },
    },
  },
]
