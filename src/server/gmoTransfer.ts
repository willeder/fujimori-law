/**
 * GMO 一括振込ファイルの生成（弁済代行）。
 * 既存 Excel「GMO一括振込ファイル変換マシン」の判定・整形ロジックを忠実に移植。
 *   - 対象判定: repaymentTarget が空（停止/終了でない）かつ「対象振込日」が期間内
 *   - 対象振込日: 初回=支払開始日(年月日そのもの)、継続=当月の約定日（支払開始日の"日"／月末開始は毎月末）
 *   - 金額: 1回目=初回支払額 / 2回目以降=2回目以降額
 *   - 整形: コードのゼロ埋め(金融機関4/支店3/口座7)、預金種目(普通1/当座2/他4)、ASC半角化、振込依頼人名
 */
import { prisma } from './db.js'
import {
  GMO_TRANSFER_TARGET_STATUSES,
  SETTLED_CREDITOR_STATUSES,
} from '../constants/fieldOptions.js'

// ── 全角→半角（Excel ASC 相当） ──────────────────────────
const KATA_MAP: Record<string, string> = {
  ア: 'ｱ', イ: 'ｲ', ウ: 'ｳ', エ: 'ｴ', オ: 'ｵ',
  カ: 'ｶ', キ: 'ｷ', ク: 'ｸ', ケ: 'ｹ', コ: 'ｺ',
  サ: 'ｻ', シ: 'ｼ', ス: 'ｽ', セ: 'ｾ', ソ: 'ｿ',
  タ: 'ﾀ', チ: 'ﾁ', ツ: 'ﾂ', テ: 'ﾃ', ト: 'ﾄ',
  ナ: 'ﾅ', ニ: 'ﾆ', ヌ: 'ﾇ', ネ: 'ﾈ', ノ: 'ﾉ',
  ハ: 'ﾊ', ヒ: 'ﾋ', フ: 'ﾌ', ヘ: 'ﾍ', ホ: 'ﾎ',
  マ: 'ﾏ', ミ: 'ﾐ', ム: 'ﾑ', メ: 'ﾒ', モ: 'ﾓ',
  ヤ: 'ﾔ', ユ: 'ﾕ', ヨ: 'ﾖ',
  ラ: 'ﾗ', リ: 'ﾘ', ル: 'ﾙ', レ: 'ﾚ', ロ: 'ﾛ',
  ワ: 'ﾜ', ヲ: 'ｦ', ン: 'ﾝ',
  ガ: 'ｶﾞ', ギ: 'ｷﾞ', グ: 'ｸﾞ', ゲ: 'ｹﾞ', ゴ: 'ｺﾞ',
  ザ: 'ｻﾞ', ジ: 'ｼﾞ', ズ: 'ｽﾞ', ゼ: 'ｾﾞ', ゾ: 'ｿﾞ',
  ダ: 'ﾀﾞ', ヂ: 'ﾁﾞ', ヅ: 'ﾂﾞ', デ: 'ﾃﾞ', ド: 'ﾄﾞ',
  バ: 'ﾊﾞ', ビ: 'ﾋﾞ', ブ: 'ﾌﾞ', ベ: 'ﾍﾞ', ボ: 'ﾎﾞ',
  パ: 'ﾊﾟ', ピ: 'ﾋﾟ', プ: 'ﾌﾟ', ペ: 'ﾍﾟ', ポ: 'ﾎﾟ',
  ヴ: 'ｳﾞ',
  ァ: 'ｧ', ィ: 'ｨ', ゥ: 'ｩ', ェ: 'ｪ', ォ: 'ｫ',
  ッ: 'ｯ', ャ: 'ｬ', ュ: 'ｭ', ョ: 'ｮ',
  ー: 'ｰ', '・': '･', '　': ' ',
}

export function asc(input: string | null | undefined): string {
  if (!input) return ''
  let out = ''
  for (const ch of input) {
    if (KATA_MAP[ch] !== undefined) {
      out += KATA_MAP[ch]
      continue
    }
    const code = ch.codePointAt(0) ?? 0
    if (code === 0x3000) out += ' '
    else if (code >= 0xff01 && code <= 0xff5e) out += String.fromCharCode(code - 0xfee0)
    else out += ch
  }
  return out
}

/** ASCII + 半角カナ を Shift-JIS(CP932) バイト列へ（GMO 取込用） */
export function toShiftJis(str: string): Buffer {
  const bytes: number[] = []
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0x3f
    if (code < 0x80) bytes.push(code)
    else if (code >= 0xff61 && code <= 0xff9f) bytes.push(code - 0xfec0) // 半角カナ
    else bytes.push(0x3f) // '?'（想定外文字）
  }
  return Buffer.from(bytes)
}

const padLeft = (v: string, len: number) =>
  v.length >= len ? v : '0'.repeat(len - v.length) + v

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
}
function ymdCompact(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

/** 振込依頼人名（Exco H 列ロジック） */
function buildPayerName(
  furigana: string | null,
  birthDate: Date | null,
  designatedCode: string | null
): string {
  const f = asc(furigana)
  if (designatedCode && designatedCode !== '') {
    return f + asc(designatedCode)
  }
  if (!birthDate) return f
  const withSpace = `${f} ${ymd(birthDate)}`
  if (withSpace.length <= 48) return withSpace
  const compact = `${f.replace(/ /g, '')}${ymdCompact(birthDate)}`
  if (compact.length <= 48) return compact
  return f.replace(/ /g, '')
}

/** 預金種目: 普通=1 / 当座=2 / その他=4 */
function depositType(accountType: string | null): string {
  if (!accountType) return ''
  if (accountType.includes('普通')) return '1'
  if (accountType.includes('当座')) return '2'
  return '4'
}

/** 支払開始日(YYYY-MM-DD) → 初回支払日(UTC)。支払開始日は和解詳細の実値（月末調整済み）。 */
function parseStartDate(paymentStartDate: string | null): Date | null {
  if (!paymentStartDate) return null
  const m = paymentStartDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

/** その月(0-based)の末日 */
function lastDayOfMonth(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate()
}

/**
 * 継続案件の「当月の振込日」。支払日項目を廃止したため支払開始日から約定日を導出する。
 * 月末約定対策: 支払開始日がその月の末日なら毎月「末日」扱い（例 9/30開始→10/31, 11/30…）。
 * それ以外はその"日"（月の日数が足りなければ末日にクランプ）。
 */
function continuingDate(refDate: Date, startDate: Date): Date {
  const sy = startDate.getUTCFullYear()
  const sm = startDate.getUTCMonth()
  const sd = startDate.getUTCDate()
  const isEndOfMonth = sd === lastDayOfMonth(sy, sm)
  const ry = refDate.getUTCFullYear()
  const rm = refDate.getUTCMonth()
  const day = isEndOfMonth
    ? lastDayOfMonth(ry, rm)
    : Math.min(sd, lastDayOfMonth(ry, rm))
  return new Date(Date.UTC(ry, rm, day))
}

export type GmoRow = {
  // GMO 取込 8 項目
  bankCode: string
  branchCode: string
  depositType: string
  accountNumber: string
  payeeName: string
  amount: number | null
  feeType: string // 手数料負担区分（空）
  payerName: string
  // 参考情報（プレビュー用）
  caseId: number
  externalId: string | null
  clientName: string | null
  creditorName: string
  round: '1回目' | '2回目以降'
  transferDate: string // 対象振込日 YYYY-MM-DD
  incomplete: boolean // 口座情報不足
}

export type GmoResult = {
  periodStart: string
  periodEnd: string
  refDate: string
  rows: GmoRow[]
  count: number
  incompleteCount: number
  overLimit: boolean // 999件超
}

/**
 * 対象期間の振込対象を算出。
 * @param start 期間開始(YYYY-MM-DD)
 * @param end   期間終了(YYYY-MM-DD)
 *
 * 継続案件の「当月判定」は対象期間（開始日）の年月を用いる。
 * （旧・基準日 ref は対象期間と同じ月を二重指定していたため廃止し、開始月から導出する）
 */
export async function buildGmoTransfers(
  start: string,
  end: string
): Promise<GmoResult> {
  const startD = new Date(`${start}T00:00:00Z`)
  const endD = new Date(`${end}T00:00:00Z`)
  // 当月判定の基準＝対象期間の開始月（継続案件の振込日をこの月の支払日に置く）
  const refD = startD

  // 当月入金フィルタ：対象期間の月に「実際に入金があった案件(クライアント)」だけを弁済対象にする。
  // 弁済代行は当月の入金分を原資に債権者へ振り込むため、当月入金が無い案件には振り込まない。
  // （kintone実データとの照合で確定したルール。これが無いと未入金クライアントの債権者まで過剰計上される）
  const monthStart = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth() + 1, 1))
  const paidRows = await prisma.payment.findMany({
    where: { actualDate: { gte: monthStart, lt: monthEnd } },
    select: { caseId: true },
    distinct: ['caseId'],
  })
  const paidCaseIds = new Set(paidRows.map((p) => p.caseId))

  const creditors = await prisma.creditor.findMany({
    where: {
      repaymentTarget: null, // 停止/終了は対象外
      paymentStartMonth: { not: null }, // 支払開始日(年月日)を保持
      caseId: { in: [...paidCaseIds] }, // 当月入金のある案件のみ
      // 受任後ステータスが弁済継続中の案件だけを対象にする。
      // 破産手続中・免責済・キャンセル・辞任・資格者面談待ち・全和解済_完済 は
      // もう弁済代行が発生しないため、振込データに含めない。
      case: { settlementStatus: { in: [...GMO_TRANSFER_TARGET_STATUSES] } },
    },
    select: {
      caseId: true,
      creditorName: true,
      paymentStartMonth: true,
      paymentDay: true,
      firstPaymentAmount: true,
      subsequentPaymentAmount: true,
      financialInstitutionCode: true,
      branchCode: true,
      accountType: true,
      accountNumber: true,
      accountHolder: true,
      designatedCode: true,
      case: {
        select: { externalId: true, name: true, furigana: true, birthDate: true },
      },
    },
  })

  const rows: GmoRow[] = []
  for (const c of creditors) {
    const first = parseStartDate(c.paymentStartMonth) // 支払開始日(年月日)
    if (!first) continue
    // 対象振込日 M
    let M: Date
    if (first >= startD && first <= endD) M = first
    else if (first <= startD) M = continuingDate(refD, first)
    else M = first
    // 対象判定 L
    if (!(M >= startD && M <= endD)) continue
    const round: '1回目' | '2回目以降' = M.getTime() === first.getTime() ? '1回目' : '2回目以降'
    const amount = round === '1回目' ? c.firstPaymentAmount : c.subsequentPaymentAmount

    const bankCode = c.financialInstitutionCode ? padLeft(String(c.financialInstitutionCode), 4) : ''
    const branchCode = c.branchCode ? padLeft(String(c.branchCode), 3) : ''
    const dType = depositType(c.accountType)
    const accountNumber = c.accountNumber ? padLeft(String(c.accountNumber), 7) : ''
    const payeeName = asc(c.accountHolder)
    const payerName = buildPayerName(c.case.furigana, c.case.birthDate, c.designatedCode)

    const incomplete =
      bankCode === '' ||
      branchCode === '' ||
      dType === '' ||
      accountNumber === '' ||
      payeeName === '' ||
      amount == null

    rows.push({
      bankCode,
      branchCode,
      depositType: dType,
      accountNumber,
      payeeName,
      amount,
      feeType: '',
      payerName,
      caseId: c.caseId,
      externalId: c.case.externalId,
      clientName: c.case.name,
      creditorName: c.creditorName,
      round,
      transferDate: M.toISOString().slice(0, 10),
      incomplete,
    })
  }

  // ID 昇順 → 振込日
  rows.sort(
    (a, b) =>
      (a.externalId ?? '').localeCompare(b.externalId ?? '') ||
      a.transferDate.localeCompare(b.transferDate)
  )

  return {
    periodStart: start,
    periodEnd: end,
    refDate: start.slice(0, 7), // 当月判定に用いた年月(YYYY-MM)
    rows,
    count: rows.length,
    incompleteCount: rows.filter((r) => r.incomplete).length,
    overLimit: rows.length > 999,
  }
}

// ============================================================
// 未整備検知（弁済対象なのに支払条件・振込先が未入力の債権者）
// GMO対象から漏れる原因を能動的に検知して、案件詳細で補完できるようにする。
// 対象: 停止/終了でない（repaymentTarget=null）かつ「弁済対象」＝和解成立のステータス
//       または和解日ありの債権者で、支払条件 or 振込先口座のいずれかが欠損。
//
// targetMonth(YYYY-MM) を渡すと「その月に支払いが必要な債権者のみ」に絞る。
//   判定: 支払開始日の年月 ≤ 対象月 ≤ 最終支払日の年月（最終支払日が空なら上限なし）。
//   支払開始日が未入力で対象月を判定できない債権者は対象外（無視）。
// ============================================================
export type IncompleteRow = {
  creditorId: number
  caseId: number
  externalId: string | null
  clientName: string | null
  creditorName: string
  status: string
  settlementDate: string | null
  scheduleMissing: boolean // 支払開始日/支払回数/金額のいずれか欠損
  accountMissing: boolean // 振込先（銀行/支店/種別/口座番号/名義）のいずれか欠損
  /**
   * 支払開始日が未入力で、そもそも「対象月に支払いが必要か」を判定できない。
   * 以前はこの条件で丸ごと絞り落としていたため、弁済対象なのに GMO 振込へ
   * 一度も載らない債権者が警告にも出てこなかった（4,409社・1,610案件）。
   */
  monthUnknown: boolean
}
export type IncompleteResult = {
  rows: IncompleteRow[]
  count: number
  scheduleMissingCount: number
  accountMissingCount: number
  monthUnknownCount: number
}

export async function buildIncompleteRepayments(
  targetMonth: string
): Promise<IncompleteResult> {
  const creditors = await prisma.creditor.findMany({
    where: {
      repaymentTarget: null, // 停止/終了は除外
      // 振込データと同じ条件で受任後ステータスを絞る。
      // 振込対象にならない案件を「未整備」として挙げても対応のしようがないため。
      case: { settlementStatus: { in: [...GMO_TRANSFER_TARGET_STATUSES] } },
      AND: [
        {
          OR: [
            { settlementDate: { not: null } },
            { status: { in: [...SETTLED_CREDITOR_STATUSES] } },
          ],
        },
        {
          OR: [
            // ① 対象月に支払いが必要なもの。
            //    支払開始日/最終支払日は年月日(YYYY-MM-DD)で保持しているため、
            //    対象月(YYYY-MM)を月初(-01)・月末(-31)の境界文字列に展開して比較する。
            {
              AND: [
                { paymentStartMonth: { not: null, lte: `${targetMonth}-31` } },
                {
                  // 最終支払日が未入力なら上限なし、入力ありなら対象月以降まで継続中のもの
                  OR: [
                    { finalPaymentMonth: null },
                    { finalPaymentMonth: { gte: `${targetMonth}-01` } },
                  ],
                },
              ],
            },
            // ② 支払開始日が未入力で対象月を判定できないもの。
            //    弁済対象なのに GMO 振込へ永久に載らないため、月に関係なく必ず出す。
            { paymentStartMonth: null },
          ],
        },
      ],
    },
    select: {
      id: true,
      caseId: true,
      creditorName: true,
      status: true,
      settlementDate: true,
      paymentStartMonth: true,
      paymentCount: true,
      paymentDay: true,
      firstPaymentAmount: true,
      subsequentPaymentAmount: true,
      financialInstitutionCode: true,
      branchCode: true,
      accountType: true,
      accountNumber: true,
      accountHolder: true,
      case: { select: { externalId: true, name: true } },
    },
  })

  const empty = (v: unknown) =>
    v == null || (typeof v === 'string' && v.trim() === '')

  const rows: IncompleteRow[] = []
  for (const c of creditors) {
    // 支払日項目は廃止（支払開始日から約定日を導出）。支払条件の欠損は
    // 支払開始日が空、または初回/2回目以降の金額がいずれも空、で判定する。
    // 支払回数が空だと creditorSchedule.ts が弁済予定を1行も生成しないため、
    // 支払開始日・金額と同じく「支払条件の不足」として扱う。
    const scheduleMissing =
      empty(c.paymentStartMonth) ||
      c.paymentCount == null ||
      (c.firstPaymentAmount == null && c.subsequentPaymentAmount == null)
    const monthUnknown = c.paymentStartMonth == null
    const accountMissing =
      empty(c.financialInstitutionCode) ||
      empty(c.branchCode) ||
      empty(c.accountType) ||
      empty(c.accountNumber) ||
      empty(c.accountHolder)
    if (!scheduleMissing && !accountMissing) continue
    rows.push({
      creditorId: c.id,
      caseId: c.caseId,
      externalId: c.case.externalId,
      clientName: c.case.name,
      creditorName: c.creditorName,
      status: c.status,
      settlementDate: c.settlementDate
        ? c.settlementDate.toISOString().slice(0, 10)
        : null,
      scheduleMissing,
      accountMissing,
      monthUnknown,
    })
  }
  rows.sort(
    (a, b) =>
      (a.externalId ?? '').localeCompare(b.externalId ?? '') ||
      a.creditorName.localeCompare(b.creditorName)
  )
  return {
    rows,
    count: rows.length,
    scheduleMissingCount: rows.filter((r) => r.scheduleMissing).length,
    accountMissingCount: rows.filter((r) => r.accountMissing).length,
    monthUnknownCount: rows.filter((r) => r.monthUnknown).length,
  }
}

function rowToCsvLine(r: GmoRow): string {
  return [
    r.bankCode,
    r.branchCode,
    r.depositType,
    r.accountNumber,
    r.payeeName,
    r.amount ?? '',
    r.feeType,
    r.payerName,
  ].join(',')
}

/** GMO 取込 CSV（8 項目・ヘッダー無し）。口座情報不足の行は除外して出力 */
export function toGmoCsv(result: GmoResult): string {
  return result.rows.filter((r) => !r.incomplete).map(rowToCsvLine).join('\r\n')
}

/** GMO 上限 999 件/ファイルで分割した Shift-JIS CSV 群（口座情報不足は除外） */
export function gmoCsvChunks(result: GmoResult): { name: string; data: Buffer }[] {
  const lines = result.rows.filter((r) => !r.incomplete).map(rowToCsvLine)
  const out: { name: string; data: Buffer }[] = []
  const total = Math.max(1, Math.ceil(lines.length / 999))
  for (let i = 0, idx = 1; i < lines.length; i += 999, idx++) {
    out.push({
      name: `gmo_transfer_${result.periodStart}_${idx}of${total}.csv`,
      data: toShiftJis(lines.slice(i, i + 999).join('\r\n')),
    })
  }
  return out
}

// ── 最小 ZIP 生成（store/無圧縮・追加依存なし） ─────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

export function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'ascii')
    const crc = crc32(f.data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0, 6)
    lh.writeUInt16LE(0, 8) // method 0 = store
    lh.writeUInt16LE(0, 10)
    lh.writeUInt16LE(0, 12)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(f.data.length, 18)
    lh.writeUInt32LE(f.data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)
    parts.push(lh, nameBuf, f.data)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0, 8)
    ch.writeUInt16LE(0, 10)
    ch.writeUInt16LE(0, 12)
    ch.writeUInt16LE(0, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(f.data.length, 20)
    ch.writeUInt32LE(f.data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30)
    ch.writeUInt16LE(0, 32)
    ch.writeUInt16LE(0, 34)
    ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38)
    ch.writeUInt32LE(offset, 42)
    central.push(Buffer.concat([ch, nameBuf]))
    offset += lh.length + nameBuf.length + f.data.length
  }
  const cd = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...parts, cd, eocd])
}
