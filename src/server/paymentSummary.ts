/**
 * 入金管理ファイル（集計）の出力。
 *
 * 事務所で運用している Excel「入金管理ファイル.xlsx」の1つ目のタブ（シート名「入金管理」）
 * と同じ集計を、アプリの payments テーブルから直接作って xlsx で返す。
 * 従来は kintone の入金予定サブテーブルを2つ目のタブ（入金管理貼付け先）へ貼り付け、
 * SUMIFS で集計していた。その貼り付け作業を無くすのが目的。
 *
 * 元の Excel との対応（貼付け先タブの列 → payments の列）:
 *   E 入金予定日          → plannedDate
 *   F 入金予定額          → plannedAmount
 *   G 報酬充当予定額      → plannedFeeAllocation
 *   H 弁代報酬充当予定額  → plannedAgentFeeAllocation
 *   I ﾌﾟｰﾙ充当予定額      → plannedPoolAllocation
 *   J 社数（予定）        → repaymentCount
 *   K 手数料（予定）      → handlingFee
 *   L 弁済充当予定額      → plannedRepaymentAllocation
 *   N 実入金日            → actualDate
 *   O 実入金額            → actualAmount
 *   P 報酬充当額          → actualFeeAllocation
 *   Q 弁代報酬充当額      → actualAgentFeeAllocation
 *   R ﾌﾟｰﾙ充当額          → actualPoolAllocation
 *   T 数（実績の社数）    → actualRepaymentCount
 *   U 振)手数料（実績）   → actualHandlingFee
 *   V 弁済充当額          → actualRepaymentAllocation
 *
 * 集計の仕方も元ファイルに合わせている。
 *   - 「〜予定額」は **入金予定日** で、「〜額（実績）」は **実入金日** で月/年に振り分ける
 *     （弁済充当額も元ファイルは弁済日ではなく実入金日で集計しているため、それに合わせる）
 *   - 「累計」列は日付の有無に関わらず全レコードの単純合計（元ファイルの SUM(列:列) と同じ）
 *   - 受任後ステータス等での絞り込みは行わない（元ファイルも絞り込んでいない）
 *
 * 社数について:
 *   元ファイルは「弁代報酬充当（予定）額 ÷ 1,505」で社数に換算していたが、実際の単価は
 *   1,521円で、実績側は手数料が引かれない行があるため大きくずれる（2026-07 実績: 実列
 *   6,739社 に対し ÷1,505 では 9,817.8社）。ここでは kintone の実列（社数 / 数）を
 *   そのまま合計する。手数料 = 社数 × 129円 は全件で一致するため、検算に使える。
 */
import { prisma } from './db.js'
import { buildXlsx, STYLE, type XlsxRow } from './xlsxWrite.js'

/**
 * 1社あたりの振込手数料（円）。手数料 = 社数 × この単価 が全件で成立するため、
 * 出力した社数の検算に使う。変わったら環境変数 HANDLING_FEE_UNIT で上書きできる。
 */
export const HANDLING_FEE_UNIT = Number(process.env.HANDLING_FEE_UNIT ?? '') || 129

/**
 * この出力を使えるユーザー（メールアドレス）。
 * 現状スタッフ全員が ADMIN ロールのため、ロールでは絞れずメールの許可制にしている。
 * 環境変数 PAYMENT_SUMMARY_ALLOWED_EMAILS（カンマ区切り）があればそちらを優先。
 */
const DEFAULT_ALLOWED = ['dobashi.mitsuru', 'tanaka.shungo']

export function paymentSummaryAllowedEmails(): string[] {
  const env = (process.env.PAYMENT_SUMMARY_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return env.length ? env : DEFAULT_ALLOWED
}

/** そのユーザーが入金管理ファイルを出力できるか */
export function canExportPaymentSummary(email: string | null | undefined): boolean {
  if (!email) return false
  return paymentSummaryAllowedEmails().includes(email.trim().toLowerCase())
}

// ── 集計 ────────────────────────────────────────────────────
type Bucket = {
  amount: number
  fee: number
  agentFee: number
  pool: number
  repayment: number
  /** 社数（予定は「社数」列 / 実績は「数」列） */
  count: number
  /** 手数料（予定は「手数料」列 / 実績は「振)手数料」列） */
  handling: number
}

const zero = (): Bucket => ({
  amount: 0, fee: 0, agentFee: 0, pool: 0, repayment: 0, count: 0, handling: 0,
})

/** Postgres の sum() は bigint / numeric を返すので数値へ寄せる */
const num = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'bigint' ? Number(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

type RawRow = {
  k: string
  amount: unknown
  fee: unknown
  agent_fee: unknown
  pool: unknown
  repayment: unknown
  cnt: unknown
  handling: unknown
}

const toMap = (rows: RawRow[]): Map<string, Bucket> => {
  const m = new Map<string, Bucket>()
  for (const r of rows) {
    m.set(r.k, {
      amount: num(r.amount),
      fee: num(r.fee),
      agentFee: num(r.agent_fee),
      pool: num(r.pool),
      repayment: num(r.repayment),
      count: num(r.cnt),
      handling: num(r.handling),
    })
  }
  return m
}

export type PaymentSummary = {
  months: string[] // 'YYYY-MM'
  years: string[] // 'YYYY'
  plannedByMonth: Map<string, Bucket>
  actualByMonth: Map<string, Bucket>
  plannedByYear: Map<string, Bucket>
  actualByYear: Map<string, Bucket>
  plannedTotal: Bucket
  actualTotal: Bucket
  rows: number
}

/** payments から集計を作る。1回のリクエストで5クエリ（軽い集約のみ）。 */
export async function buildPaymentSummary(): Promise<PaymentSummary> {
  const plannedMonth = await prisma.$queryRaw<RawRow[]>`
    SELECT to_char("plannedDate", 'YYYY-MM') AS k,
           sum("plannedAmount")              AS amount,
           sum("plannedFeeAllocation")       AS fee,
           sum("plannedAgentFeeAllocation")  AS agent_fee,
           sum("plannedPoolAllocation")      AS pool,
           sum("plannedRepaymentAllocation") AS repayment,
           sum("repaymentCount")             AS cnt,
           sum("handlingFee")                AS handling
      FROM payments WHERE "plannedDate" IS NOT NULL GROUP BY 1`
  const actualMonth = await prisma.$queryRaw<RawRow[]>`
    SELECT to_char("actualDate", 'YYYY-MM')  AS k,
           sum("actualAmount")               AS amount,
           sum("actualFeeAllocation")        AS fee,
           sum("actualAgentFeeAllocation")   AS agent_fee,
           sum("actualPoolAllocation")       AS pool,
           sum("actualRepaymentAllocation")  AS repayment,
           sum("actualRepaymentCount")       AS cnt,
           sum("actualHandlingFee")          AS handling
      FROM payments WHERE "actualDate" IS NOT NULL GROUP BY 1`
  const totals = await prisma.$queryRaw<
    {
      rows: unknown
      p_amount: unknown
      p_fee: unknown
      p_agent: unknown
      p_pool: unknown
      p_rep: unknown
      p_cnt: unknown
      p_hand: unknown
      a_amount: unknown
      a_fee: unknown
      a_agent: unknown
      a_pool: unknown
      a_rep: unknown
      a_cnt: unknown
      a_hand: unknown
    }[]
  >`
    SELECT count(*)                          AS rows,
           sum("plannedAmount")              AS p_amount,
           sum("plannedFeeAllocation")       AS p_fee,
           sum("plannedAgentFeeAllocation")  AS p_agent,
           sum("plannedPoolAllocation")      AS p_pool,
           sum("plannedRepaymentAllocation") AS p_rep,
           sum("repaymentCount")             AS p_cnt,
           sum("handlingFee")                AS p_hand,
           sum("actualAmount")               AS a_amount,
           sum("actualFeeAllocation")        AS a_fee,
           sum("actualAgentFeeAllocation")   AS a_agent,
           sum("actualPoolAllocation")       AS a_pool,
           sum("actualRepaymentAllocation")  AS a_rep,
           sum("actualRepaymentCount")       AS a_cnt,
           sum("actualHandlingFee")          AS a_hand
      FROM payments`

  const plannedByMonth = toMap(plannedMonth)
  const actualByMonth = toMap(actualMonth)

  // 月キーの最小〜最大を連続で埋める（データが無い月も列として出す）
  const keys = [...plannedByMonth.keys(), ...actualByMonth.keys()].sort()
  const months: string[] = []
  if (keys.length) {
    const [ys, ms] = keys[0].split('-').map(Number)
    const [ye, me] = keys[keys.length - 1].split('-').map(Number)
    for (let y = ys, m = ms; y < ye || (y === ye && m <= me); ) {
      months.push(`${y}-${String(m).padStart(2, '0')}`)
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
  }
  const years = [...new Set(months.map((m) => m.slice(0, 4)))]

  const rollUp = (byMonth: Map<string, Bucket>): Map<string, Bucket> => {
    const m = new Map<string, Bucket>()
    for (const [k, v] of byMonth) {
      const y = k.slice(0, 4)
      const cur = m.get(y) ?? zero()
      cur.amount += v.amount
      cur.fee += v.fee
      cur.agentFee += v.agentFee
      cur.pool += v.pool
      cur.repayment += v.repayment
      cur.count += v.count
      cur.handling += v.handling
      m.set(y, cur)
    }
    return m
  }

  const t = totals[0] ?? ({} as Record<string, unknown>)
  return {
    months,
    years,
    plannedByMonth,
    actualByMonth,
    plannedByYear: rollUp(plannedByMonth),
    actualByYear: rollUp(actualByMonth),
    plannedTotal: {
      amount: num(t.p_amount),
      fee: num(t.p_fee),
      agentFee: num(t.p_agent),
      pool: num(t.p_pool),
      repayment: num(t.p_rep),
      count: num(t.p_cnt),
      handling: num(t.p_hand),
    },
    actualTotal: {
      amount: num(t.a_amount),
      fee: num(t.a_fee),
      agentFee: num(t.a_agent),
      pool: num(t.a_pool),
      repayment: num(t.a_rep),
      count: num(t.a_cnt),
      handling: num(t.a_hand),
    },
    rows: num(t.rows),
  }
}

// ── xlsx 化 ──────────────────────────────────────────────────
/** 元ファイルの行と同じ並び。predicted=入金予定日で集計 / actual=実入金日で集計 */
const METRICS: {
  label: string
  side: 'planned' | 'actual'
  key: keyof Bucket
}[] = [
  { label: '入金予定額', side: 'planned', key: 'amount' },
  { label: '入金額', side: 'actual', key: 'amount' },
  { label: '報酬充当予定額', side: 'planned', key: 'fee' },
  { label: '報酬充当額', side: 'actual', key: 'fee' },
  { label: '弁代報酬充当予定額', side: 'planned', key: 'agentFee' },
  { label: '弁代報酬充当額', side: 'actual', key: 'agentFee' },
  { label: 'ﾌﾟｰﾙ充当予定額', side: 'planned', key: 'pool' },
  { label: 'ﾌﾟｰﾙ充当額', side: 'actual', key: 'pool' },
  { label: '弁済充当予定額', side: 'planned', key: 'repayment' },
  { label: '弁済充当額', side: 'actual', key: 'repayment' },
  // 社数はkintoneの実列をそのまま合計する（予定=「社数」/ 実績=「数」）
  { label: '社数（予定）', side: 'planned', key: 'count' },
  { label: '社数（実績）', side: 'actual', key: 'count' },
  { label: '手数料（予定）', side: 'planned', key: 'handling' },
  { label: '振)手数料（実績）', side: 'actual', key: 'handling' },
]

const r1 = (n: number): number => Math.round(n * 10) / 10

/**
 * 「年月別」または「年別」のブロックを組み立てる。
 * 先頭列: A=区分 / B=項目 / C=累計 / D以降=各期間
 */
function buildBlock(
  title: string,
  periods: string[],
  planned: Map<string, Bucket>,
  actual: Map<string, Bucket>,
  plannedTotal: Bucket,
  actualTotal: Bucket
): XlsxRow[] {
  const rows: XlsxRow[] = []
  const moneyStyles = (n: number) => [0, 0, ...Array<number>(n + 1).fill(STYLE.money)]
  const decStyles = (n: number) => [0, 0, ...Array<number>(n + 1).fill(STYLE.decimal)]

  // 見出し行
  rows.push({
    cells: [title, '項目', '累計', ...periods],
    styles: Array<number>(periods.length + 3).fill(STYLE.header),
  })

  const pick = (side: 'planned' | 'actual', key: keyof Bucket, p: string): number =>
    (side === 'planned' ? planned.get(p) : actual.get(p))?.[key] ?? 0
  const total = (side: 'planned' | 'actual', key: keyof Bucket): number =>
    side === 'planned' ? plannedTotal[key] : actualTotal[key]

  // ① 報酬充当予定額合計（元ファイルの1行目 = 報酬充当予定額 + 弁代報酬充当予定額）
  rows.push({
    cells: [
      '',
      '報酬充当予定額合計（報酬＋弁代報酬）',
      plannedTotal.fee + plannedTotal.agentFee,
      ...periods.map((p) => pick('planned', 'fee', p) + pick('planned', 'agentFee', p)),
    ],
    styles: moneyStyles(periods.length),
  })
  // ② 報酬未充当残（元ファイルの2行目 = ① − 報酬充当額 − 弁代報酬充当額）
  rows.push({
    cells: [
      '',
      '報酬未充当残（①−報酬充当額−弁代報酬充当額）',
      plannedTotal.fee + plannedTotal.agentFee - actualTotal.fee - actualTotal.agentFee,
      ...periods.map(
        (p) =>
          pick('planned', 'fee', p) +
          pick('planned', 'agentFee', p) -
          pick('actual', 'fee', p) -
          pick('actual', 'agentFee', p)
      ),
    ],
    styles: moneyStyles(periods.length),
  })

  for (const m of METRICS) {
    rows.push({
      cells: [
        '',
        m.label,
        total(m.side, m.key),
        ...periods.map((p) => pick(m.side, m.key, p)),
      ],
      styles: moneyStyles(periods.length),
    })
  }

  // 検算用。手数料 ÷ 129 は社数と一致するはず（予定側は全件一致する）
  rows.push({
    cells: [
      '',
      `社数の検算（手数料÷${HANDLING_FEE_UNIT}・予定）`,
      r1(plannedTotal.handling / HANDLING_FEE_UNIT),
      ...periods.map((p) => r1(pick('planned', 'handling', p) / HANDLING_FEE_UNIT)),
    ],
    styles: decStyles(periods.length),
  })
  // 元ファイル D16 相当（弁代報酬の未充当額）
  rows.push({
    cells: [
      '',
      '弁代報酬未充当額（予定−実績）',
      plannedTotal.agentFee - actualTotal.agentFee,
      ...periods.map((p) => pick('planned', 'agentFee', p) - pick('actual', 'agentFee', p)),
    ],
    styles: moneyStyles(periods.length),
  })

  return rows
}

/** 集計結果を xlsx（1シート）にする */
export function paymentSummaryToXlsx(s: PaymentSummary, generatedAt: string): Buffer {
  const width = Math.max(s.months.length, s.years.length) + 3
  const rows: XlsxRow[] = [
    { cells: ['入金管理（集計）'], styles: [STYLE.header] },
    {
      cells: [
        '',
        `出力日時 ${generatedAt}`,
        `対象 入金予定 ${s.rows.toLocaleString()} 行 / 社数は kintone の「社数」「数」列の合計`,
      ],
    },
    { cells: [] },
    ...buildBlock(
      '年月別入金管理',
      s.months,
      s.plannedByMonth,
      s.actualByMonth,
      s.plannedTotal,
      s.actualTotal
    ),
    { cells: [] },
    ...buildBlock(
      '年別入金管理',
      s.years,
      s.plannedByYear,
      s.actualByYear,
      s.plannedTotal,
      s.actualTotal
    ),
  ]

  const colWidths = [16, 34, 16, ...Array<number>(Math.max(width - 3, 0)).fill(13)]
  return buildXlsx('入金管理', rows, { freezeAt: 'D5', colWidths })
}

/** ファイル名（例: 入金管理_20260807.xlsx） */
export function paymentSummaryFileName(today: string): string {
  return `入金管理_${today.replace(/-/g, '')}.xlsx`
}
