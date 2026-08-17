/**
 * 入金データ取込（銀行入出金明細 → 入金スケジュールへの実入金反映）
 *
 * 修正依頼 No.88/90/91 対応。
 * ルールは 2026-05-12〜13 の田中さん定義（Telegram msg 285/294/302 相当）に基づく。
 *
 * ── 実入金反映（msg 285: 入金情報の計上定義）──
 *   A) 予定金額と同額   : 予定の各項目の数値を反映
 *   B) 予定金額より超過 : 報酬額などは予定のまま、プール金へ差額を加算
 *   C) 予定金額より不足 : 実入金額に合わせて各項目を反映（充当優先順位:
 *      弁済→弁代報酬→手数料→報酬）し、不足分の補充行を1行追加。
 *      ※元行の入金予定額は予定のまま（入金額相違でソート可能に）
 *
 * ── イレギュラー入金の取込ルール（msg 294: a〜e）──
 *   a) 既存データと同一日で入金があり、金額も同一         → 取り込まない
 *   b) 同一日2回入金の合算金額が既存データと同一           → 取り込まない
 *   c) 同一日2回入金で既存データがない                     → 1行に合算金額で反映
 *   d) 同一日2回入金で既存データに1回目が反映済み           → 2回目の金額だけを次の行に反映
 *   e) 同一日入金で金額が既存データと相違                   → 取込みエラーで表示
 *
 * 一般化した判定（同一日・同一案件の入金明細群 deposits と既存実入金 existing）:
 *   - sum(deposits) == sum(existing)               → skip     （a・b）
 *   - existing なし                                → reflect  合算額を次の未入金行へ（c・通常）
 *   - 0 < sum(existing) < sum(deposits)            → reflect  差額のみ次の未入金行へ（d）
 *   - それ以外（金額の食い違い）                    → error    （e）
 */
import { prisma } from './db.js'
import { decodeCsvBytes, parseCsv } from './intakeImport.js'
import { isXlsx, parseXlsxToRows } from './xlsxLite.js'
import { writeAudit, type Actor } from './audit.js'

/** 銀行明細1行（入金のみ対象） */
export interface DepositRow {
  rowNo: number
  date: string // YYYY-MM-DD
  amount: number
  /** 振込入金口座（バーチャル口座）番号。案件との突合キー */
  accountNumber: string | null
  /** バーチャル口座の支店名。口座番号と組にして突合キーにする */
  branch: string | null
  /** 振込依頼人名（名義照合に使う。支店・口座番号を除いた部分） */
  payerName: string | null
  /** 摘要の原文（表示・監査用） */
  rawSummary: string | null
}

/** 名義照合の結果 */
export type NameCheck =
  | 'match' // 氏名まで一致（旧姓・新姓の括弧表記も考慮）
  | 'given-only' // 名だけ一致（姓が違う ＝ 家族などによる代理振込とみなす）
  | 'mismatch' // 一致しない ＝ 誤入金の疑い
  | 'unknown' // 依頼者のフリガナ未登録などで判定できない

export interface DepositGroupPlan {
  date: string
  accountNumber: string | null
  /** バーチャル口座の支店名（摘要から抽出） */
  branch: string | null
  payerName: string | null
  deposits: { rowNo: number; amount: number }[]
  depositSum: number
  caseId: number | null
  externalId: string | null
  clientName: string | null
  /** 依頼者フリガナ（名義照合の根拠として画面に出す） */
  clientFurigana: string | null
  /** 名義照合の結果 */
  nameCheck: NameCheck
  /** 判定結果 */
  action: 'skip' | 'reflect' | 'error' | 'unmatched'
  /** 反映額（reflect時。d では差額のみ） */
  reflectAmount: number | null
  /** 反映先の入金予定行 */
  targetPaymentId: number | null
  targetPlannedDate: string | null
  targetPlannedAmount: number | null
  /** A/B/C の別（reflect時） */
  pattern: 'A' | 'B' | 'C' | null
  /** C のとき追加する補充行の金額 */
  supplementAmount: number | null
  /** 不足のうちプール金から取り崩した額（reflect時） */
  fromPool: number | null
  /** 人向けの説明 */
  note: string
}

export interface DepositPreview {
  encoding: string
  headerFound: boolean
  rows: number
  groups: DepositGroupPlan[]
  errorCount: number
  unmatchedCount: number
}

const norm = (s: string): string =>
  (s ?? '')
    .replace(/\s+/g, '')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .toLowerCase()

/** 日付文字列を YYYY-MM-DD に（YYYY/M/D, YYYY-MM-DD, YYYYMMDD, Excelシリアル値対応） */
export function toIsoDate(v: string): string | null {
  const s = (v ?? '').trim()
  if (s === '') return null
  let m = s.match(/^(\d{4})[/\-年.](\d{1,2})[/\-月.](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // Excel シリアル値（1900年基準）
  if (/^\d{5}$/.test(s)) {
    const n = Number(s)
    if (n > 20000 && n < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
      return dt.toISOString().slice(0, 10)
    }
  }
  return null
}

const toAmount = (v: string): number | null => {
  const s = (v ?? '').replace(/[,，\s円¥\\"]/g, '').trim()
  if (s === '' || s === '-') return null
  if (!/^-?\d+$/.test(s)) return null
  return Number(s)
}

// ============================================================
// 摘要の分解
// ------------------------------------------------------------
// GMOあおぞらの入出金明細には口座番号の専用列が無く、依頼者からの入金は
// 摘要1列に「振込依頼人名・支店名・バーチャル口座番号」が連結されている。
//   例: 「振込  タカシマ　サオリ エキデン支店 6946670」
//        └ 振込依頼人名 ┘└ 支店名 ┘└ 口座番号 ┘
// 債権者への弁済（出金）は「振込 ミツイスミトモ アコム（カ」のように
// 支店名・口座番号を持たないため、この正規表現には一致しない。
// ============================================================

/** 摘要 → 振込依頼人名 / 支店名 / 口座番号 */
const SUMMARY_RE = /^振込[\s　]+(.+?)[\s　]+([^\s　]+支店)[\s　]+([0-9０-９]{6,8})$/

/** 全角数字→半角 */
const toHalfDigits = (s: string): string =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

export type ParsedSummary = {
  payerName: string | null
  branch: string | null
  accountNumber: string | null
}

/**
 * 摘要を3要素に分解する。分解できない場合は payerName に原文を返す
 * （V口座を経由しない直接振込など。手動処理へ回す）。
 */
export function parseSummary(raw: string): ParsedSummary {
  const s = (raw ?? '').trim()
  if (!s) return { payerName: null, branch: null, accountNumber: null }
  const m = s.match(SUMMARY_RE)
  if (!m) return { payerName: s, branch: null, accountNumber: null }
  // 振込依頼人名の先頭に振込人自身の口座番号が入っている明細があるため除去する
  //   例: 「７１３７６７４１　ノムラ　ケイスケ」→「ノムラ　ケイスケ」
  const payer = m[1].replace(/^[0-9０-９]+[\s　]*/, '').trim()
  return {
    payerName: payer || null,
    branch: m[2],
    accountNumber: toHalfDigits(m[3]),
  }
}

// ============================================================
// 名義照合
// ------------------------------------------------------------
// 振込依頼人名と依頼者フリガナを突き合わせ、他人のV口座への誤振込を検知する。
// 全銀システムのカナは小書き文字を使わない（ショウタ → シヨウタ）ため、
// 小書き→大書きに正規化しないと 14% 程度が誤判定になる（7月実績で確認）。
// ============================================================

/** 小書きカナ・濁点ゆれを吸収した比較キー */
const KANA_FOLD: Record<string, string> = {
  ァ: 'ア', ィ: 'イ', ゥ: 'ウ', ェ: 'エ', ォ: 'オ',
  ャ: 'ヤ', ュ: 'ユ', ョ: 'ヨ', ッ: 'ツ', ヮ: 'ワ',
  ヵ: 'カ', ヶ: 'ケ', ヅ: 'ズ', ヂ: 'ジ',
}
const kanaKey = (s: string): string =>
  (s ?? '')
    .normalize('NFKC') // 半角カナ・全角英数を統一
    .replace(/[\s　]+/g, '')
    .replace(/[ァィゥェォャュョッヮヵヶヅヂ]/g, (c) => KANA_FOLD[c] ?? c)

/** 空白区切りの最後の要素＝名（下の名前） */
const givenPart = (s: string): string => {
  const t = (s ?? '').normalize('NFKC').trim()
  if (!t) return ''
  const parts = t.split(/[\s　]+/)
  return parts[parts.length - 1] ?? ''
}

/**
 * 依頼者フリガナから照合候補を作る。
 * 「フクトメ　エナ（サカモト）」のような旧姓・新姓の併記に対応し、
 * 括弧内を姓として差し替えた候補も許容する。
 */
function furiganaCandidates(furigana: string | null): { keys: Set<string>; given: string } {
  const raw = (furigana ?? '').normalize('NFKC')
  if (!raw.trim()) return { keys: new Set(), given: '' }
  const paren = raw.match(/[（(]([^）)]*)[）)]/)
  const plain = raw.replace(/[（(][^）)]*[）)]/g, '').trim()
  const given = givenPart(plain)
  const keys = new Set<string>()
  if (plain) keys.add(kanaKey(plain))
  if (paren?.[1]?.trim()) keys.add(kanaKey(paren[1] + given)) // 別姓＋名
  return { keys, given: kanaKey(given) }
}

/** 振込依頼人名と依頼者フリガナを照合する */
export function checkPayerName(
  payerName: string | null,
  furigana: string | null
): NameCheck {
  const payer = kanaKey(payerName ?? '')
  const { keys, given } = furiganaCandidates(furigana)
  if (!payer || keys.size === 0) return 'unknown'
  // 銀行側は文字数上限で名前が切れることがあるため前方一致も許容する
  for (const k of keys) {
    if (payer === k || k.startsWith(payer) || payer.startsWith(k)) return 'match'
  }
  if (given && kanaKey(givenPart(payerName ?? '')) === given) return 'given-only'
  return 'mismatch'
}

/**
 * 明細CSV/Excelをパースして入金行を抽出する。
 * ヘッダー行を自動検出し、列は名称の部分一致で柔軟にマッピングする
 * （GMOあおぞらの入出金明細・バーチャル口座明細のどちらの形式でも読めるように）。
 */
export function parseDeposits(buf: Buffer): {
  encoding: string
  headerFound: boolean
  rows: DepositRow[]
} {
  let allRows: string[][]
  let encoding: string
  if (isXlsx(buf)) {
    allRows = parseXlsxToRows(buf)
    encoding = 'xlsx'
  } else {
    const dec = decodeCsvBytes(buf)
    allRows = parseCsv(dec.text)
    encoding = dec.encoding
  }
  const rows = allRows.filter((r) => r.some((c) => (c ?? '').trim() !== ''))
  if (rows.length === 0) return { encoding, headerFound: false, rows: [] }

  // ヘッダー行の検出（日付系と金額系の列名を含む行を先頭5行から探す）
  const dateHeads = ['取引日', '入金日', '日付', '振込日', '起算日']
  const amountHeads = ['入金金額', '入金額', '取引金額', '金額']
  const acctHeads = ['振込入金口座番号', 'バーチャル口座', 'v口座', '口座番号', '振込入金口座']
  const payerHeads = ['振込依頼人名', '依頼人名', '振込人名義', '振込人', '摘要', '名義']

  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const n = rows[i].map(norm)
    const hasDate = dateHeads.some((h) => n.some((c) => c.includes(norm(h))))
    const hasAmount = amountHeads.some((h) => n.some((c) => c.includes(norm(h))))
    if (hasDate && hasAmount) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) return { encoding, headerFound: false, rows: [] }

  const header = rows[headerIdx].map(norm)
  const findCol = (names: string[]): number => {
    for (const nm of names) {
      const i = header.findIndex((c) => c === norm(nm))
      if (i >= 0) return i
    }
    for (const nm of names) {
      const i = header.findIndex((c) => c.includes(norm(nm)))
      if (i >= 0) return i
    }
    return -1
  }
  const dateIdx = findCol(dateHeads)
  const amountIdx = findCol(amountHeads)
  // 出金金額列がある場合（総合明細）、入金のみ対象にする
  const outIdx = findCol(['出金金額', '出金額'])
  const acctIdx = findCol(acctHeads)
  const payerIdx = findCol(payerHeads)

  const out: DepositRow[] = []
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const cell = (idx: number) => (idx >= 0 && idx < r.length ? (r[idx] ?? '') : '')
    const date = toIsoDate(cell(dateIdx))
    const amount = toAmount(cell(amountIdx))
    const outgo = outIdx >= 0 ? toAmount(cell(outIdx)) : null
    if (!date || amount == null || amount <= 0) return
    if (outgo != null && outgo > 0) return // 出金明細は対象外

    // 口座番号の専用列があればそれを使う。無い形式（GMOあおぞらの入出金明細）では
    // 摘要から「振込依頼人名・支店名・口座番号」を切り出す。
    const rawSummary = cell(payerIdx).trim() || null
    const acctCol = cell(acctIdx).trim()
    const parsed = rawSummary ? parseSummary(rawSummary) : null
    out.push({
      rowNo: headerIdx + 2 + i,
      date,
      amount,
      accountNumber: acctCol ? toHalfDigits(acctCol) : (parsed?.accountNumber ?? null),
      branch: parsed?.branch ?? null,
      payerName: parsed?.payerName ?? rawSummary,
      rawSummary,
    })
  })
  return { encoding, headerFound: true, rows: out }
}

/**
 * 実入金の充当計算。
 *
 * kintone の実データ192,446行を検証して得た事務所の実際の運用に合わせている。
 *
 *   1. 入金があった時点では **報酬** と **弁代報酬** だけを充当する。
 *      弁済充当額と振)手数料は、実際に債権者へ振り込んだ時点で計上するもので、
 *      入金時点では 0。振り込むまでの原資はプールに残る。
 *   2. 予定額に届かなかった不足分は、まず **プール金** から取り崩す。
 *      プール残高で足りない分だけ **報酬** を減らす（弁代報酬は必ず満額確保する）。
 *   3. プール充当額は残余（実入金額 − 報酬 − 弁代報酬）。取り崩したぶんは負値になる。
 *
 * 恒等式「実入金額 = 報酬 + 弁代報酬 + プール + 弁済 + 振)手数料」は
 * kintone 側でも 44,430/44,431 行で成立しており、この計算でも常に成立する。
 *
 * @param poolBalance この入金を反映する前の、案件のプール残高（実プール充当額の累計）
 */
export function allocateActual(
  planned: {
    plannedAmount: number
    plannedFeeAllocation: number
    plannedAgentFeeAllocation: number
  },
  actualAmount: number,
  poolBalance: number,
): {
  actualFeeAllocation: number | null
  actualAgentFeeAllocation: number | null
  actualPoolAllocation: number | null
  actualRepaymentAllocation: number | null
  actualHandlingFee: number | null
  pattern: 'A' | 'B' | 'C'
  /** 予定額に対する不足額（補充行の金額） */
  shortage: number
  /** 不足のうちプール金から取り崩した額 */
  fromPool: number
} {
  const shortage = Math.max(0, planned.plannedAmount - actualAmount)
  // 不足はまずプール残高で埋め、足りない分だけ報酬を減らす
  const fromPool = Math.min(shortage, Math.max(poolBalance, 0))
  const fee = planned.plannedFeeAllocation - (shortage - fromPool)
  const agentFee = planned.plannedAgentFeeAllocation
  // プールは残余。kintone にも負値の行があるため、ここでは 0 で止めない。
  const pool = actualAmount - fee - agentFee
  const pattern =
    actualAmount === planned.plannedAmount ? 'A' : actualAmount > planned.plannedAmount ? 'B' : 'C'
  return {
    actualFeeAllocation: fee || null,
    actualAgentFeeAllocation: agentFee || null,
    actualPoolAllocation: pool || null,
    // 弁済と手数料は振込実行時に計上する
    actualRepaymentAllocation: null,
    actualHandlingFee: null,
    pattern,
    shortage,
    fromPool,
  }
}

type PaymentRow = {
  id: number
  caseId: number
  creditorId: number | null
  plannedDate: Date | null
  plannedAmount: number | null
  plannedFeeAllocation: number | null
  plannedAgentFeeAllocation: number | null
  plannedPoolAllocation: number | null
  plannedRepaymentAllocation: number | null
  actualDate: Date | null
  actualAmount: number | null
  actualPoolAllocation: number | null
  handlingFee: number | null
  repaymentCount: number | null
}

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

/**
 * 支店名の表記ゆれを吸収する。
 *
 * 同じ支店が経路によって違う表記で届く:
 *   DB（kintone由来） … 「あじさい支店」「アドレス支店」
 *   Webhook（仕様書）  … 「ｱｼﾞｻｲ」（vaBranchNameKana・半角カナ・「支店」なし）
 *   CSV（銀行明細）    … 「ｱｼﾞｻｲｼﾃﾝ」など
 *
 * NFKC で半角カナを全角へ、ひらがなをカタカナへ寄せ、「支店」を落として比較する。
 * さらに、銀行の半角カナは小書き文字（ｬｭｮｯ等）を大書きに変換する慣習があるため
 * （「ちきゅう支店」に対して「ﾁｷﾕｳ」が届く）、小書きも大書きへ寄せてから比較する。
 * 数字だけ（支店コード "502" など）の場合はそのまま返す。
 */
const SMALL_KANA_MAP: Record<string, string> = {
  ァ: 'ア', ィ: 'イ', ゥ: 'ウ', ェ: 'エ', ォ: 'オ',
  ッ: 'ツ', ャ: 'ヤ', ュ: 'ユ', ョ: 'ヨ', ヮ: 'ワ',
  ヵ: 'カ', ヶ: 'ケ',
}

export function normalizeBranchName(s: string | null | undefined): string {
  if (!s) return ''
  let t = String(s).normalize('NFKC')
  // ひらがな → カタカナ
  t = t.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
  // 小書き → 大書き（全銀の半角カナに小書きが無いため）
  t = t.replace(/[ァィゥェォッャュョヮヵヶ]/g, (c) => SMALL_KANA_MAP[c] ?? c)
  t = t.replace(/支店|シテン/g, '')
  t = t.replace(/[\s\u3000ー・（）()]/g, '')
  return t
}

/** 取込プランを作成（プレビューとコミットで共通） */
export async function planDepositImport(buf: Buffer): Promise<DepositPreview> {
  const parsed = parseDeposits(buf)
  if (!parsed.headerFound) {
    return {
      encoding: parsed.encoding,
      headerFound: false,
      rows: 0,
      groups: [],
      errorCount: 0,
      unmatchedCount: 0,
    }
  }
  return await planDepositRows(parsed.rows, parsed.encoding)
}

/**
 * 明細行から反映プランを組み立てる（CSV取込・GMO Webhook 共通）。
 *
 * CSV取込は parseDeposits() で作った行を、GMOのWebhook（振込入金口座_入金明細通知）は
 * 通知のJSONから作った行を渡す。どちらも突合・名義照合・充当の判定は同じにする。
 */
export async function planDepositRows(
  rows: DepositRow[],
  encoding = 'utf-8'
): Promise<DepositPreview> {
  const parsed = { rows, encoding }
  const groups: DepositGroupPlan[] = []

  // 口座番号 → 案件 の突合マップ。
  // vAccountNumber には一意制約が無く、実データにも同一番号・別支店の案件が
  // 存在するため、支店名まで含めた複合キーを優先して突合する。
  //
  // 支店名の表記は経路によって違う（DB「あじさい支店」／Webhook「ｱｼﾞｻｲ」／CSV「ｱｼﾞｻｲｼﾃﾝ」）ため、
  // normalizeBranchName() でカタカナに揃えてから突き合わせる。
  const accts = [...new Set(parsed.rows.map((r) => r.accountNumber).filter((s): s is string => !!s))]
  const cases = accts.length
    ? await prisma.case.findMany({
        where: { vAccountNumber: { in: accts } },
        select: {
          id: true,
          externalId: true,
          name: true,
          furigana: true,
          vAccountBranch: true,
          vAccountNumber: true,
        },
      })
    : []
  type CaseRow = (typeof cases)[number]
  const byBranchAcct = new Map<string, CaseRow>()
  const byAcctOnly = new Map<string, CaseRow[]>()
  for (const c of cases) {
    const num = c.vAccountNumber as string
    if (c.vAccountBranch) byBranchAcct.set(normalizeBranchName(c.vAccountBranch) + '|' + num, c)
    const list = byAcctOnly.get(num) ?? []
    list.push(c)
    byAcctOnly.set(num, list)
  }
  /** 支店＋番号 → 番号のみ（一意なときだけ）の順で案件を特定する */
  const resolveCase = (
    branch: string | null,
    accountNumber: string | null
  ): { kase: CaseRow | null; ambiguous: boolean } => {
    if (!accountNumber) return { kase: null, ambiguous: false }
    if (branch) {
      const hit = byBranchAcct.get(normalizeBranchName(branch) + '|' + accountNumber)
      if (hit) return { kase: hit, ambiguous: false }
    }
    const list = byAcctOnly.get(accountNumber) ?? []
    if (list.length === 1) return { kase: list[0], ambiguous: false }
    if (list.length > 1) return { kase: null, ambiguous: true } // 同一番号が複数案件 → 自動突合しない
    return { kase: null, ambiguous: false }
  }

  // 同一案件（支店＋口座）・同一日でグループ化（a〜e は「同一日」の単位で判定）
  const keyOf = (r: DepositRow) =>
    normalizeBranchName(r.branch) +
    '|' +
    (r.accountNumber ?? '?' + (r.payerName ?? '')) +
    ' ' +
    r.date
  const grouped = new Map<string, DepositRow[]>()
  for (const r of parsed.rows) {
    const k = keyOf(r)
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k)!.push(r)
  }

  for (const [, rows] of grouped) {
    const { date, accountNumber, branch, payerName } = rows[0]
    const depositSum = rows.reduce((s, r) => s + r.amount, 0)
    const { kase, ambiguous } = resolveCase(branch, accountNumber)
    const nameCheck: NameCheck = kase ? checkPayerName(payerName, kase.furigana) : 'unknown'
    const base: Omit<DepositGroupPlan, 'action' | 'note'> = {
      date,
      accountNumber,
      branch,
      payerName,
      deposits: rows.map((r) => ({ rowNo: r.rowNo, amount: r.amount })),
      depositSum,
      caseId: kase?.id ?? null,
      externalId: kase?.externalId ?? null,
      clientName: kase?.name ?? null,
      clientFurigana: kase?.furigana ?? null,
      nameCheck,
      reflectAmount: null,
      targetPaymentId: null,
      targetPlannedDate: null,
      targetPlannedAmount: null,
      pattern: null,
      supplementAmount: null,
      fromPool: null,
    }
    if (!kase) {
      groups.push({
        ...base,
        action: 'unmatched',
        note: ambiguous
          ? `口座番号 ${accountNumber} が複数の案件に登録されています（支店で特定できません・要確認）`
          : accountNumber
            ? `バーチャル口座 ${branch ?? ''} ${accountNumber} に一致する案件がありません`
            : '摘要から口座番号を読み取れませんでした（手動で反映してください）',
      })
      continue
    }

    // 名義照合: 他人のV口座への誤振込を自動では反映しない
    if (nameCheck === 'mismatch') {
      groups.push({
        ...base,
        action: 'error',
        note: `振込依頼人名「${payerName ?? ''}」が依頼者「${kase.furigana ?? kase.name}」と一致しません（誤振込の疑い・要確認）`,
      })
      continue
    }

    const payments: PaymentRow[] = await prisma.payment.findMany({
      where: { caseId: kase.id },
      orderBy: [{ plannedDate: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        caseId: true,
        creditorId: true,
        plannedDate: true,
        plannedAmount: true,
        plannedFeeAllocation: true,
        plannedAgentFeeAllocation: true,
        plannedPoolAllocation: true,
        plannedRepaymentAllocation: true,
        actualDate: true,
        actualAmount: true,
        actualPoolAllocation: true,
        handlingFee: true,
        repaymentCount: true,
      },
    })

    // 既存データ＝同一日の実入金
    const existingSameDay = payments.filter((p) => iso(p.actualDate) === date)
    const existingSum = existingSameDay.reduce((s, p) => s + (p.actualAmount ?? 0), 0)

    if (existingSameDay.length > 0 && existingSum === depositSum) {
      // a) / b) 取り込まない
      groups.push({
        ...base,
        action: 'skip',
        note: `同一日の実入金 ${existingSum.toLocaleString()}円 が反映済みのため取込みません（ルールa/b）`,
      })
      continue
    }

    let reflectAmount = depositSum
    let ruleNote = ''
    if (existingSameDay.length > 0) {
      if (existingSum > 0 && existingSum < depositSum) {
        // d) 反映済み分を除いた差額のみ次の行へ
        reflectAmount = depositSum - existingSum
        ruleNote = `同一日に ${existingSum.toLocaleString()}円 反映済みのため差額のみ反映（ルールd）`
      } else {
        // e) 金額の相違 → エラー
        groups.push({
          ...base,
          action: 'error',
          note: `同一日の既存実入金 ${existingSum.toLocaleString()}円 と明細合計 ${depositSum.toLocaleString()}円 が相違しています（ルールe・要確認）`,
        })
        continue
      }
    } else if (rows.length > 1) {
      ruleNote = `同一日${rows.length}回の入金を合算して反映（ルールc）`
    }

    // 反映先: 未入金（actualDate なし・予定額あり）の最も古い行
    const target = payments.find((p) => p.actualDate == null && (p.plannedAmount ?? 0) > 0)
    if (!target) {
      groups.push({
        ...base,
        action: 'error',
        note: '反映先の未入金予定行がありません（手動で行を追加してください）',
      })
      continue
    }
    // プール残高＝これまでに実際にプールへ積まれた額の合計
    const poolBalance = payments.reduce((sum, p) => sum + (p.actualPoolAllocation ?? 0), 0)
    const alloc = allocateActual(
      {
        plannedAmount: target.plannedAmount ?? 0,
        plannedFeeAllocation: target.plannedFeeAllocation ?? 0,
        plannedAgentFeeAllocation: target.plannedAgentFeeAllocation ?? 0,
      },
      reflectAmount,
      poolBalance,
    )
    groups.push({
      ...base,
      action: 'reflect',
      reflectAmount,
      targetPaymentId: target.id,
      targetPlannedDate: iso(target.plannedDate),
      targetPlannedAmount: target.plannedAmount,
      pattern: alloc.pattern,
      supplementAmount: alloc.shortage > 0 ? alloc.shortage : null,
      fromPool: alloc.fromPool || null,
      note:
        [
          nameCheck === 'given-only'
            ? `振込依頼人名「${payerName ?? ''}」は依頼者と姓が異なります（名は一致・代理振込とみなして反映）`
            : '',
          ruleNote,
          alloc.pattern === 'A'
            ? '予定と同額（パターンA）'
            : alloc.pattern === 'B'
              ? `予定より超過（パターンB・プールへ+${(reflectAmount - (target.plannedAmount ?? 0)).toLocaleString()}円）`
              : `予定より不足（パターンC・補充行 ${alloc.shortage.toLocaleString()}円 を追加）`,
        ]
          .filter(Boolean)
          .join('。') || '反映します',
    })
  }

  // 表示順: エラー → 未突合 → 反映 → スキップ、同分類内は日付順
  const order = { error: 0, unmatched: 1, reflect: 2, skip: 3 } as const
  groups.sort((a, b) => order[a.action] - order[b.action] || a.date.localeCompare(b.date))

  return {
    encoding: parsed.encoding,
    headerFound: true,
    rows: parsed.rows.length,
    groups,
    errorCount: groups.filter((g) => g.action === 'error').length,
    unmatchedCount: groups.filter((g) => g.action === 'unmatched').length,
  }
}

export interface DepositCommitResult {
  ok: boolean
  reflected: number
  skipped: number
  errors: number
  unmatched: number
  supplements: number
}

/** CSV取込：プランを作ってそのまま反映する */
export async function commitDepositImport(actor: Actor, buf: Buffer): Promise<DepositCommitResult> {
  const plan = await planDepositImport(buf)
  return await applyDepositPlan(actor, plan, 'deposit-import')
}

/** 監査ログに出す取込元の表示名 */
const SOURCE_LABELS: Record<string, string> = {
  'deposit-import': '入金データ取込',
  'gmo-webhook': 'GMO入金通知',
  'gmo-unsent-list': 'GMO未送信明細の回収',
}

/**
 * プランどおりに実入金を反映（reflect のみ実行。skip/error/unmatched は変更なし）。
 * source は監査ログの出所（'deposit-import' / 'gmo-webhook' / 'gmo-unsent-list'）。
 */
export async function applyDepositPlan(
  actor: Actor,
  plan: DepositPreview,
  source = 'deposit-import'
): Promise<DepositCommitResult> {
  let reflected = 0
  let supplements = 0

  for (const g of plan.groups) {
    if (g.action !== 'reflect' || g.targetPaymentId == null || g.reflectAmount == null) continue
    await prisma.$transaction(async (tx) => {
      const target = await tx.payment.findUnique({ where: { id: g.targetPaymentId! } })
      if (!target || target.actualDate != null) return // 二重実行防止
      // プール残高は反映直前に取り直す（同一実行内で複数件を順に反映するため）
      const poolAgg = await tx.payment.aggregate({
        where: { caseId: target.caseId },
        _sum: { actualPoolAllocation: true },
      })
      const alloc = allocateActual(
        {
          plannedAmount: target.plannedAmount ?? 0,
          plannedFeeAllocation: target.plannedFeeAllocation ?? 0,
          plannedAgentFeeAllocation: target.plannedAgentFeeAllocation ?? 0,
        },
        g.reflectAmount!,
        poolAgg._sum.actualPoolAllocation ?? 0,
      )
      await tx.payment.update({
        where: { id: target.id },
        data: {
          actualDate: new Date(`${g.date}T00:00:00Z`),
          actualAmount: g.reflectAmount!,
          actualFeeAllocation: alloc.actualFeeAllocation,
          actualAgentFeeAllocation: alloc.actualAgentFeeAllocation,
          actualPoolAllocation: alloc.actualPoolAllocation,
          // 弁済充当額・振)手数料・社数（実績）は債権者への振込を実行した時点で計上する。
          // 入金時点では未確定なので触らない（原資はプールに残る）。
          actualRepaymentAllocation: alloc.actualRepaymentAllocation,
          actualHandlingFee: alloc.actualHandlingFee,
        },
      })
      reflected += 1
      // C) 不足分の補充行を追加。
      // 入金予定日は「不足が出た元の予定行と同じ日」にする。
      // （元の予定日が空の場合のみ、実入金日をフォールバックとして使う）
      if (alloc.pattern === 'C' && alloc.shortage > 0) {
        const suppDate = target.plannedDate ?? new Date(`${g.date}T00:00:00Z`)
        await tx.payment.create({
          data: {
            caseId: target.caseId,
            creditorId: target.creditorId,
            plannedDate: suppDate,
            plannedAmount: alloc.shortage,
          },
        })
        supplements += 1
      }
    })
  }

  await writeAudit({
    actor,
    action: 'UPDATE',
    entity: 'Payment',
    summary: `${SOURCE_LABELS[source] ?? '入金データ取込'}: 反映${reflected}件・補充行${supplements}件・スキップ${plan.groups.filter((g) => g.action === 'skip').length}件・エラー${plan.errorCount}件・未突合${plan.unmatchedCount}件`,
    metadata: { source },
  })

  return {
    ok: true,
    reflected,
    supplements,
    skipped: plan.groups.filter((g) => g.action === 'skip').length,
    errors: plan.errorCount,
    unmatched: plan.unmatchedCount,
  }
}
