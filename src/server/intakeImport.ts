/**
 * 相談票 CSV 取込（新規依頼者の一括登録）。
 *
 * 入力は相談票Excelの「新kintone-取込」シートを書き出したCSV。
 *   - 取込は「1ファイル1顧客」が前提（複数顧客＝*複数 はエラーで中止）
 *   - 1レコード = 依頼者1名（Case）＋ 債権者明細（最大20社・Creditor）
 *   - レコードの開始: 「レコードの開始行」列が `*`、または 名前/ID 列が非空の行
 *   - 続く行（名前・IDが空）は、直前レコードの債権者サブ行として追加
 *   - 債権者は受任対象・受任対象外の両方を保持。集計（債権社数・申告債務額）は
 *     受任対象（status≠受任対象外）のみで突き合わせ、不一致はエラーで中止
 *
 * 文字コードは UTF-8 / UTF-8(BOM) / Shift-JIS を自動判定。
 * preview は検証のみ（無書込）、commit はトランザクションで Case+Creditor を作成し監査ログを残す。
 */
import { prisma } from './db.js'
import { writeAudit, type Actor } from './audit.js'
import { isXlsx, parseXlsxToRows, parseXlsxSheetRows } from './xlsxLite.js'

// ── 列マッピング（新kintone-取込のヘッダー名 → DBフィールド） ──────────
type FieldType = 'string' | 'int' | 'date'
type ColMap = { header: string; field: string; type: FieldType }

const CASE_COLUMNS: ColMap[] = [
  { header: 'ID', field: 'externalId', type: 'string' },
  { header: 'リスト区分', field: 'listCategory', type: 'string' },
  { header: 'リスト登録日', field: 'listRegisteredDate', type: 'date' },
  { header: '名前', field: 'name', type: 'string' },
  { header: 'フリガナ', field: 'furigana', type: 'string' },
  { header: '電話番号', field: 'phone', type: 'string' },
  { header: 'メールアドレス', field: 'email', type: 'string' },
  { header: '居住形態', field: 'residenceType', type: 'string' },
  { header: '家賃', field: 'rent', type: 'int' },
  { header: '郵便番号', field: 'postalCode', type: 'string' },
  { header: '都道府県', field: 'prefecture', type: 'string' },
  { header: '住所', field: 'address', type: 'string' },
  { header: '旧住所', field: 'previousAddress', type: 'string' },
  { header: '生年月日', field: 'birthDate', type: 'date' },
  { header: '年齢', field: 'age', type: 'int' },
  { header: '性別', field: 'gender', type: 'string' },
  { header: '結婚', field: 'maritalStatus', type: 'string' },
  { header: '子供', field: 'children', type: 'string' },
  { header: '同居', field: 'cohabitation', type: 'string' },
  { header: '内密先', field: 'confidentialContact', type: 'string' },
  { header: '緊急連絡先', field: 'emergencyContact', type: 'string' },
  { header: '関係(緊急)', field: 'emergencyContactRelation', type: 'string' },
  { header: '月収(手取)', field: 'monthlyIncome', type: 'int' },
  { header: '給与日', field: 'payDay', type: 'string' },
  { header: '給与口座', field: 'payrollAccount', type: 'string' },
  { header: '勤務先名', field: 'employerName', type: 'string' },
  { header: '勤務形態', field: 'employmentType', type: 'string' },
  { header: '勤務先連絡先', field: 'employerContact', type: 'string' },
  { header: '勤務先住所', field: 'employerAddress', type: 'string' },
  { header: '他事務所相談', field: 'otherOfficeConsultation', type: 'string' },
  { header: '遅れ', field: 'paymentDelay', type: 'string' },
  { header: '自転車', field: 'bicycleNote', type: 'string' },
  { header: '年金', field: 'pension', type: 'string' },
  { header: 'アポ担当', field: 'appointmentStaff', type: 'string' },
  { header: '後確担当', field: 'followUpStaff', type: 'string' },
  { header: '受任日', field: 'acceptanceDate', type: 'date' },
  { header: '面談担当', field: 'interviewStaff', type: 'string' },
  { header: '担当司法書士', field: 'judicialScrivener', type: 'string' },
  { header: '債務整理区分', field: 'debtAdjustmentType', type: 'string' },
  { header: '債権社数', field: 'creditorCount', type: 'int' },
  { header: '申告債務額', field: 'declaredDebtAmount', type: 'int' },
  { header: '通常報酬', field: 'normalFee', type: 'int' },
  { header: '報酬分割回数', field: 'installmentCount', type: 'int' },
  { header: '弁済代行', field: 'agentPayment', type: 'string' },
  { header: '予定代弁社数', field: 'plannedAgentCount', type: 'int' },
  { header: '予定弁済総数', field: 'plannedPaymentCount', type: 'int' },
  { header: '予定弁済報酬総額', field: 'plannedPaymentFeeTotal', type: 'int' },
  { header: '依頼 前 返済額', field: 'preRequestPayment', type: 'int' },
  { header: '依頼 後 返済額', field: 'postRequestPayment', type: 'int' },
  { header: '初回入金予定日', field: 'firstPaymentDate', type: 'date' },
  { header: '10日以内', field: 'firstPaymentWithinTenDays', type: 'string' },
  { header: '初回入金額', field: 'firstPaymentAmount', type: 'int' },
  { header: '基本入金額', field: 'basePaymentAmount', type: 'int' },
  { header: '面談時備考１', field: 'interviewMemo1', type: 'string' },
  { header: '面談時備考２', field: 'interviewMemo2', type: 'string' },
  { header: '収支メモ', field: 'incomeExpenseMemo', type: 'string' },
  { header: '受任後ステータス', field: 'settlementStatus', type: 'string' },
  { header: 'V口座-支店', field: 'vAccountBranch', type: 'string' },
  { header: 'V口座-番号', field: 'vAccountNumber', type: 'string' },
]

/** 和解内容コメントから「和解金額：X円」を取り出す */
const SETTLE_AMOUNT_RE = /和解金額[：:]\s*([0-9,]+)\s*円/
export function settlementAmountFromComment(text: unknown): number | null {
  if (typeof text !== 'string') return null
  const m = SETTLE_AMOUNT_RE.exec(text)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

const CREDITOR_COLUMNS: ColMap[] = [
  { header: '債権者', field: 'creditorName', type: 'string' },
  { header: '交渉相手', field: 'negotiationPartner', type: 'string' },
  { header: '申告額', field: 'declaredAmount', type: 'int' },
  { header: '想定和解', field: 'expectedSettlement', type: 'int' },
  { header: '債権者別ステータス', field: 'status', type: 'string' },
  // ── 受任後の進捗・和解項目（移行/進行中案件向け。新規相談では空欄） ──
  { header: '次回処理日時', field: 'nextProcessDate', type: 'date' },
  { header: '受任通知送付日', field: 'acceptanceNoticeSentDate', type: 'date' },
  { header: '債権調査到着日', field: 'debtInquiryArrivalDate', type: 'date' },
  { header: '顧客コード', field: 'customerCode', type: 'string' },
  { header: '調査票_契約日', field: 'contractDate', type: 'date' },
  { header: '債権額', field: 'debtAmount', type: 'int' },
  { header: '和解提案日', field: 'settlementProposalDate', type: 'date' },
  { header: '和解提案', field: 'settlementProposal', type: 'int' },
  { header: '回答状況', field: 'responseStatus', type: 'string' },
  { header: '和解日', field: 'settlementDate', type: 'date' },
  // 相談票の「和解」列は **金額ではなく支払回数**（kintone の和解対象債権一覧と同じ）。
  // 元データ 5,138 行で照合すると 5,106 行（99.4%）が和解内容詳細の「支払回数」と一致する。
  // 以前ここを settlementAmount に入れていたため、和解金額に「60」等の回数が入っていた。
  { header: '和解', field: 'paymentCount', type: 'int' },
  { header: '和解時債務金額', field: 'settlementDebtAmount', type: 'int' },
  { header: '和解内容コメント', field: 'settlementContentComment', type: 'string' },
]

/** 入金スケジュールが入っているタブ（相談票Excel） */
const PAYMENT_SHEET_NAME = '入金情報取込配列'

/** 入金スケジュールの列（入金情報取込配列のヘッダー名 → Payment のフィールド） */
const PAYMENT_COLUMNS: ColMap[] = [
  { header: '入金予定日', field: 'plannedDate', type: 'date' },
  { header: '入金予定額', field: 'plannedAmount', type: 'int' },
  { header: '報酬充当予定額', field: 'plannedFeeAllocation', type: 'int' },
  { header: '弁代報酬充当予定額', field: 'plannedAgentFeeAllocation', type: 'int' },
  { header: 'ﾌﾟｰﾙ充当予定額', field: 'plannedPoolAllocation', type: 'int' },
  { header: '弁済充当予定額', field: 'plannedRepaymentAllocation', type: 'int' },
  { header: '社数', field: 'repaymentCount', type: 'int' },
  { header: '手数料', field: 'handlingFee', type: 'int' },
]

/** 1社あたりの振込手数料。相談票では空欄のことが多いので 社数×この単価 で補う */
const HANDLING_FEE_UNIT = 129

const RECORD_START_HEADER = 'レコードの開始行'
const DEFAULT_CREDITOR_STATUS = '受任通知発送待ち'
/** 受任後ステータスの既定値（相談票では空欄のため、取込時にこれを入れる） */
const DEFAULT_CASE_STATUS = '受任通知発送待ち'
/** 受任対象外（タブ/一覧で常に末尾に並べる） */
const EXCLUDED_CREDITOR_STATUS = '受任対象外'

/** テンプレCSVのヘッダー（A列マーカー＋全項目） */
export const INTAKE_HEADERS: string[] = [
  RECORD_START_HEADER,
  ...CASE_COLUMNS.map((c) => c.header),
  ...CREDITOR_COLUMNS.map((c) => c.header),
]

// ── エンコーディング判定＋デコード ──────────────────────────────
export function decodeCsvBytes(buf: Buffer): { text: string; encoding: string } {
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.slice(3).toString('utf8'), encoding: 'utf-8(bom)' }
  }
  // UTF-8 strict; 失敗したら Shift-JIS とみなす
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return { text, encoding: 'utf-8' }
  } catch {
    const text = new TextDecoder('shift-jis').decode(buf)
    return { text, encoding: 'shift-jis' }
  }
}

// ── CSV パース（RFC4180準拠: ダブルクオート・改行内包・CRLF対応） ──
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') {
        row.push(field)
        field = ''
      } else if (c === '\r') {
        // CRLF/CR を1改行として扱う
      } else if (c === '\n') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
      } else field += c
    }
  }
  // 末尾フィールド/行
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// ── 値の正規化 ─────────────────────────────────────────────
function norm(s: string): string {
  return (s ?? '').replace(/[\s\u3000\n\r]/g, '')
}

function coerce(type: FieldType, raw: string): unknown {
  const v = (raw ?? '').trim()
  if (v === '') return null
  if (type === 'string') return v
  if (type === 'int') {
    const n = parseInt(v.replace(/[,，円¥\s\u3000]/g, ''), 10)
    return Number.isFinite(n) ? n : null
  }
  if (type === 'date') return parseDate(v)
  return null
}

/** yyyy/m/d・yyyy-mm-dd・Excelシリアル値・ISO を Date(UTC正午) に */
export function parseDate(v: string): Date | null {
  const s = v.trim()
  if (s === '' || s === '00:00:00') return null
  // yyyy/m/d or yyyy-m-d (時刻は無視)
  let m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))
    return isNaN(d.getTime()) ? null : d
  }
  // 和暦やyyyy年m月d日
  m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))
  // Excel シリアル値（1900系）。20000≒1954年〜なので妥当域のみ
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s)
    if (serial > 20000 && serial < 60000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000)
      const d = new Date(ms)
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12))
    }
  }
  return null
}

// ── パース本体 ─────────────────────────────────────────────
export type IntakeRecord = {
  rowNo: number
  case: Record<string, unknown>
  creditors: Record<string, unknown>[]
  /** 入金スケジュール（相談票Excelの「入金情報取込配列」タブ由来。CSV取込では空） */
  payments: Record<string, unknown>[]
  errors: string[]
  warnings: string[]
}

export type ParseResult = {
  encoding: string
  headerFound: boolean
  records: IntakeRecord[]
  totalCreditors: number
  /** 取り込む入金予定の行数 */
  totalPayments: number
  errorCount: number
}

function buildIndex(headerRow: string[]): {
  caseIdx: { col: ColMap; i: number }[]
  creditorIdx: { col: ColMap; i: number }[]
  startIdx: number
  nameIdx: number
  idIdx: number
} {
  const normalized = headerRow.map(norm)
  const find = (h: string) => normalized.indexOf(norm(h))
  const caseIdx = CASE_COLUMNS.map((col) => ({ col, i: find(col.header) })).filter((x) => x.i >= 0)
  const creditorIdx = CREDITOR_COLUMNS.map((col) => ({ col, i: find(col.header) })).filter((x) => x.i >= 0)
  return {
    caseIdx,
    creditorIdx,
    startIdx: find(RECORD_START_HEADER),
    nameIdx: find('名前'),
    idIdx: find('ID'),
  }
}

/**
 * 相談票Excelの「入金情報取込配列」タブから入金スケジュールを読む。
 *
 * このタブは100行ぶんの枠が用意されていて、実際に使うのは入金予定額が入っている行だけ。
 * 残りは数式の残骸（入金予定額0・弁済充当予定額が #N/A など）なので取り込まない。
 *
 * 手数料とﾌﾟｰﾙ充当予定額は空欄のことが多いので、次のとおり補完する。
 *   手数料           = 社数 × 129円
 *   ﾌﾟｰﾙ充当予定額   = 入金予定額 − 報酬 − 弁代報酬 − 弁済 − 手数料
 * （この関係は kintone の実データ192,446行すべてで成立している）
 */
function parsePaymentSheet(buf: Buffer): Record<string, unknown>[] {
  let rows: string[][] | null = null
  try {
    rows = parseXlsxSheetRows(buf, PAYMENT_SHEET_NAME)
  } catch {
    return []
  }
  if (!rows) return []
  const nonEmpty = rows.filter((r) => r.some((c) => (c ?? '').trim() !== ''))
  if (nonEmpty.length === 0) return []

  // ヘッダー行（先頭3行のうち「入金予定日」を含む行）
  let hi = -1
  for (let i = 0; i < Math.min(nonEmpty.length, 3); i++) {
    if (nonEmpty[i].map(norm).includes(norm('入金予定日'))) {
      hi = i
      break
    }
  }
  if (hi < 0) return []
  const header = nonEmpty[hi].map(norm)
  const idxOf = (h: string) => header.indexOf(norm(h))
  const cols = PAYMENT_COLUMNS.map((col) => ({ col, i: idxOf(col.header) })).filter((x) => x.i >= 0)

  const out: Record<string, unknown>[] = []
  for (const row of nonEmpty.slice(hi + 1)) {
    const rec: Record<string, unknown> = {}
    for (const { col, i } of cols) {
      const val = coerce(col.type, i < row.length ? row[i] : '')
      if (val !== null) rec[col.field] = val
    }
    // 予定日と予定額が揃っている行だけが実データ
    const amount = (rec.plannedAmount as number | undefined) ?? 0
    if (!rec.plannedDate || amount <= 0) continue

    // 手数料・ﾌﾟｰﾙ充当予定額は空欄のことがあるので、恒等式
    //   入金予定額 = 報酬 + 弁代報酬 + ﾌﾟｰﾙ + 弁済 + 手数料
    // が必ず成立するように埋める。どちらか一方だけ空欄のときに社数×129で
    // 埋めてしまうと二重計上になるため、残余から逆算する。
    const n = (k: string) => (rec[k] as number | undefined) ?? 0
    const rest = amount - (n('plannedFeeAllocation') + n('plannedAgentFeeAllocation') + n('plannedRepaymentAllocation'))
    const hasFee = rec.handlingFee != null
    const hasPool = rec.plannedPoolAllocation != null
    if (!hasFee && !hasPool) {
      // どちらも空 … 手数料は社数×単価、残りがﾌﾟｰﾙ
      const fee = ((rec.repaymentCount as number | undefined) ?? 0) * HANDLING_FEE_UNIT
      rec.handlingFee = fee
      rec.plannedPoolAllocation = rest - fee
    } else if (!hasFee) {
      // ﾌﾟｰﾙだけ埋まっている … 手数料は残余
      rec.handlingFee = rest - n('plannedPoolAllocation')
    } else if (!hasPool) {
      // 手数料だけ埋まっている … ﾌﾟｰﾙは残余
      rec.plannedPoolAllocation = rest - n('handlingFee')
    }
    out.push(rec)
  }
  return out
}

export function parseIntake(buf: Buffer): ParseResult {
  // 入力は CSV / Excel(.xlsx) のどちらでも可。先頭バイトで判別する。
  let allRows: string[][]
  let encoding: string
  let paymentRows: Record<string, unknown>[] = []
  if (isXlsx(buf)) {
    allRows = parseXlsxToRows(buf)
    encoding = 'xlsx'
    paymentRows = parsePaymentSheet(buf)
  } else {
    const dec = decodeCsvBytes(buf)
    allRows = parseCsv(dec.text)
    encoding = dec.encoding
  }
  const rows = allRows.filter((r) => r.some((c) => (c ?? '').trim() !== ''))
  if (rows.length === 0)
    return {
      encoding,
      headerFound: false,
      records: [],
      totalCreditors: 0,
      totalPayments: 0,
      errorCount: 0,
    }

  // ヘッダー行を探す（先頭3行のうち '名前' と '債権者' を含む行）
  let headerRowIdx = -1
  for (let i = 0; i < Math.min(rows.length, 3); i++) {
    const n = rows[i].map(norm)
    if (n.includes(norm('名前')) && n.includes(norm('債権者'))) {
      headerRowIdx = i
      break
    }
  }
  const headerFound = headerRowIdx >= 0
  const idx = buildIndex(headerFound ? rows[headerRowIdx] : INTAKE_HEADERS)
  const dataRows = headerFound ? rows.slice(headerRowIdx + 1) : rows

  const records: IntakeRecord[] = []
  let cur: IntakeRecord | null = null

  const cellOf = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : '')

  dataRows.forEach((row, ri) => {
    const startMark = idx.startIdx >= 0 ? cellOf(row, idx.startIdx).trim() : ''
    const nameVal = idx.nameIdx >= 0 ? cellOf(row, idx.nameIdx).trim() : ''
    const idVal = idx.idIdx >= 0 ? cellOf(row, idx.idIdx).trim() : ''
    const isNewRecord = startMark === '*' || nameVal !== '' || (startMark === '' && idVal !== '')

    if (isNewRecord) {
      const caseData: Record<string, unknown> = {}
      for (const { col, i } of idx.caseIdx) {
        const val = coerce(col.type, cellOf(row, i))
        if (val !== null) caseData[col.field] = val
      }
      // 住所欄に都道府県が重複して入っている場合は除去（No.167 都道府県重複表示対策）
      if (typeof caseData.prefecture === 'string' && typeof caseData.address === 'string') {
        const pref = caseData.prefecture.trim()
        const addr = caseData.address.trim()
        if (pref !== '' && addr.startsWith(pref)) {
          caseData.address = addr.slice(pref.length).trim()
        }
      }
      // 受任後ステータスは相談票では空欄なので、既定値を入れる
      if (!caseData.settlementStatus) caseData.settlementStatus = DEFAULT_CASE_STATUS
      cur = {
        rowNo: ri + 1,
        case: caseData,
        creditors: [],
        payments: [],
        errors: [],
        warnings: [],
      }
      records.push(cur)
    }

    // 債権者サブ行（債権者名があれば追加。新規行の同一行にも債権者#1が入りうる）
    const creditorNameIdx = idx.creditorIdx.find((x) => x.col.field === 'creditorName')
    const creditorName = creditorNameIdx ? cellOf(row, creditorNameIdx.i).trim() : ''
    if (creditorName !== '' && cur) {
      const cr: Record<string, unknown> = {}
      for (const { col, i } of idx.creditorIdx) {
        const val = coerce(col.type, cellOf(row, i))
        if (val !== null) cr[col.field] = val
      }
      if (cr.status == null) cr.status = DEFAULT_CREDITOR_STATUS
      // 和解金額は相談票に専用の列がないため、和解内容コメント
      // （例:「和解金額：536,112円 … 支払回数：60回」）から拾う。
      // コメントが無ければ和解時債務金額で代用する（元データでは 98.7% 一致）。
      if (cr.settlementAmount == null) {
        const fromComment = settlementAmountFromComment(cr.settlementContentComment)
        cr.settlementAmount = fromComment ?? cr.settlementDebtAmount ?? null
      }
      cur.creditors.push(cr)
    }
  })

  // 入金スケジュールは「1ファイル1顧客」前提なので、レコードが1件のときだけ割り当てる
  if (records.length === 1 && paymentRows.length > 0) {
    records[0].payments = paymentRows
  }

  // 債権者の並び順を確定（受任を先、受任対象外を後ろ。各グループ内はCSV出現順を維持）し
  // displayOrder を 1 から採番。タブは左→右、合算一覧は上→下にこの順で並ぶ。
  for (const rec of records) {
    const accepted = rec.creditors.filter((c) => c.status !== EXCLUDED_CREDITOR_STATUS)
    const excluded = rec.creditors.filter((c) => c.status === EXCLUDED_CREDITOR_STATUS)
    const ordered = [...accepted, ...excluded]
    ordered.forEach((c, i) => {
      c.displayOrder = i + 1
    })
    rec.creditors = ordered
  }

  // 検証（ファイル内）
  // 取込は「1ファイル1顧客」が前提。複数顧客（*が複数 / 名前・IDが複数）はエラーで中止する。
  if (records.length > 1) {
    records[0].errors.push(
      `1ファイルに複数顧客(${records.length}件)が含まれています。取込は1ファイル1顧客です`,
    )
  }

  const seenIds = new Map<string, number>()
  let totalCreditors = 0
  for (const rec of records) {
    totalCreditors += rec.creditors.length
    if (!rec.case.name) rec.errors.push('依頼者名（名前）が空です')
    const ext = rec.case.externalId as string | undefined
    if (ext) {
      if (seenIds.has(ext)) rec.errors.push(`ID「${ext}」がファイル内で重複（行${seenIds.get(ext)}）`)
      else seenIds.set(ext, rec.rowNo)
    }

    // 集計（債権社数・申告債務額）は「受任対象のみ」で突き合わせる。
    // 受任対象外は記録として保持するが、集計対象には含めない。
    const acceptedCreditors = rec.creditors.filter((c) => c.status !== EXCLUDED_CREDITOR_STATUS)

    const cc = rec.case.creditorCount as number | undefined
    if (cc != null && cc !== acceptedCreditors.length)
      rec.errors.push(
        `債権社数(${cc})と受任対象の債権者明細(${acceptedCreditors.length}件)が不一致です`,
      )

    const declaredDebt = rec.case.declaredDebtAmount as number | undefined
    if (declaredDebt != null) {
      const sum = acceptedCreditors.reduce(
        (s, c) => s + ((c.declaredAmount as number | null) ?? 0),
        0,
      )
      if (sum !== declaredDebt)
        rec.errors.push(
          `申告債務額(${declaredDebt.toLocaleString()}円)と受任対象の申告額合計(${sum.toLocaleString()}円)が不一致です`,
        )
    }
  }

  const totalPayments = records.reduce((s, r) => s + r.payments.length, 0)
  const errorCount = records.reduce((s, r) => s + r.errors.length, 0)
  return { encoding, headerFound, records, totalCreditors, totalPayments, errorCount }
}

/** DB上の externalId 重複をチェックして errors に追記 */
export async function checkExistingIds(result: ParseResult): Promise<void> {
  const ids = result.records
    .map((r) => r.case.externalId as string | undefined)
    .filter((x): x is string => !!x)
  if (ids.length === 0) return
  const existing = await prisma.case.findMany({
    where: { externalId: { in: ids } },
    select: { externalId: true },
  })
  const set = new Set(existing.map((e) => e.externalId))
  for (const rec of result.records) {
    const ext = rec.case.externalId as string | undefined
    if (ext && set.has(ext)) rec.errors.push(`ID「${ext}」は既にシステムに登録済みです`)
  }
}

// ── プレビュー（検証のみ） ────────────────────────────────────
export async function previewIntake(buf: Buffer): Promise<ParseResult> {
  const result = parseIntake(buf)
  await checkExistingIds(result)
  result.errorCount = result.records.reduce((s, r) => s + r.errors.length, 0)
  return result
}

// ── 確定登録（Case + Creditor 作成・監査ログ） ────────────────────
export type CommitResult = {
  status: number
  body: {
    ok: boolean
    created?: { caseId: number; name: string; externalId: string | null; creditors: number }[]
    error?: string
    errorCount?: number
  }
}

export async function commitIntake(actor: Actor, buf: Buffer): Promise<CommitResult> {
  const result = parseIntake(buf)
  await checkExistingIds(result)
  const errorCount = result.records.reduce((s, r) => s + r.errors.length, 0)
  if (result.records.length === 0)
    return { status: 400, body: { ok: false, error: '取込対象のレコードがありません' } }
  if (errorCount > 0)
    return {
      status: 400,
      body: { ok: false, error: 'エラーがあるため登録を中止しました', errorCount },
    }

  const created: { caseId: number; name: string; externalId: string | null; creditors: number }[] = []
  // 1レコードずつ作成（部分的失敗時も成功分は残す方針。各案件は単一createで原子的）
  for (const rec of result.records) {
    const c = await prisma.case.create({
      data: {
        ...(rec.case as Record<string, unknown>),
        createdBy: actor.email ?? null,
        updatedBy: actor.email ?? null,
        creditors: rec.creditors.length
          ? { create: rec.creditors as never }
          : undefined,
        payments: rec.payments.length ? { create: rec.payments as never } : undefined,
      } as never,
      select: { id: true, name: true, externalId: true },
    })
    created.push({
      caseId: c.id,
      name: c.name,
      externalId: c.externalId,
      creditors: rec.creditors.length,
    })
    await writeAudit({
      actor,
      action: 'CREATE',
      entity: 'Case',
      entityId: String(c.id),
      summary: `相談票取込[${result.encoding}]: ${c.name}（債権者${rec.creditors.length}件・入金予定${rec.payments.length}件）`,
      metadata: { externalId: c.externalId, source: `intake-${result.encoding}` },
    })
  }

  return { status: 200, body: { ok: true, created } }
}
