/**
 * GMO 一括振込ファイルの生成（弁済代行）。
 * 既存 Excel「GMO一括振込ファイル変換マシン」の判定・整形ロジックを忠実に移植。
 *   - 対象判定: repaymentTarget が空（停止/終了でない）かつ「対象振込日」が期間内
 *   - 対象振込日: 初回=支払開始月(+支払日)、継続=基準日の当月の支払日（EOMONTH(基準日,-1)+支払日 相当）
 *   - 金額: 1回目=初回支払額 / 2回目以降=2回目以降額
 *   - 整形: コードのゼロ埋め(金融機関4/支店3/口座7)、預金種目(普通1/当座2/他4)、ASC半角化、振込依頼人名
 */
import { prisma } from './db'

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

/** "YYYY-MM" + 支払日 → 初回支払日(UTC) */
function firstPaymentDate(paymentStartMonth: string | null, paymentDay: number | null): Date | null {
  if (!paymentStartMonth || paymentDay == null) return null
  const m = paymentStartMonth.match(/^(\d{4})-(\d{2})/)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, paymentDay))
}

/** EOMONTH(基準日,-1)+支払日 相当 = 基準日当月の支払日 */
function continuingDate(refDate: Date, paymentDay: number): Date {
  return new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), paymentDay))
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
 * @param ref   基準日(YYYY-MM-DD, Excel TODAY 相当)
 */
export async function buildGmoTransfers(
  start: string,
  end: string,
  ref: string
): Promise<GmoResult> {
  const startD = new Date(`${start}T00:00:00Z`)
  const endD = new Date(`${end}T00:00:00Z`)
  const refD = new Date(`${ref}T00:00:00Z`)

  const creditors = await prisma.creditor.findMany({
    where: {
      repaymentTarget: null, // 停止/終了は対象外
      paymentStartMonth: { not: null },
      paymentDay: { not: null },
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
    const first = firstPaymentDate(c.paymentStartMonth, c.paymentDay)
    if (!first) continue
    // 対象振込日 M
    let M: Date
    if (first >= startD && first <= endD) M = first
    else if (first <= startD) M = continuingDate(refD, c.paymentDay as number)
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
    refDate: ref,
    rows,
    count: rows.length,
    incompleteCount: rows.filter((r) => r.incomplete).length,
    overLimit: rows.length > 999,
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
