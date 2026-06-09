/**
 * 相談票 CSV 取込（新規依頼者の一括登録）。
 *
 * 入力は相談票Excelの「新kintone-取込」シートを書き出したCSV。
 *   - 1レコード = 依頼者1名（Case）＋ 債権者明細（最大20社・Creditor）
 *   - レコードの開始: 「レコードの開始行」列が `*`、または 名前/ID 列が非空の行
 *   - 続く行（名前・IDが空）は、直前レコードの債権者サブ行として追加
 *
 * 文字コードは UTF-8 / UTF-8(BOM) / Shift-JIS を自動判定。
 * preview は検証のみ（無書込）、commit はトランザクションで Case+Creditor を作成し監査ログを残す。
 */
import { prisma } from './db'
import { writeAudit, type Actor } from './audit'

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
  { header: '和解', field: 'settlementAmount', type: 'int' },
  { header: '和解時債務金額', field: 'settlementDebtAmount', type: 'int' },
  { header: '和解内容コメント', field: 'settlementContentComment', type: 'string' },
]

const RECORD_START_HEADER = 'レコードの開始行'
const DEFAULT_CREDITOR_STATUS = '受任通知発送待ち'

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
  errors: string[]
  warnings: string[]
}

export type ParseResult = {
  encoding: string
  headerFound: boolean
  records: IntakeRecord[]
  totalCreditors: number
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

export function parseIntake(buf: Buffer): ParseResult {
  const { text, encoding } = decodeCsvBytes(buf)
  const rows = parseCsv(text).filter((r) => r.some((c) => (c ?? '').trim() !== ''))
  if (rows.length === 0)
    return { encoding, headerFound: false, records: [], totalCreditors: 0, errorCount: 0 }

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
      cur = { rowNo: ri + 1, case: caseData, creditors: [], errors: [], warnings: [] }
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
      cur.creditors.push(cr)
    }
  })

  // 検証（ファイル内）
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
    const cc = rec.case.creditorCount as number | undefined
    if (cc != null && cc !== rec.creditors.length)
      rec.warnings.push(`債権社数(${cc})と債権者明細(${rec.creditors.length}件)が不一致`)
  }

  const errorCount = records.reduce((s, r) => s + r.errors.length, 0)
  return { encoding, headerFound, records, totalCreditors, errorCount }
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
      summary: `相談票CSV取込: ${c.name}（債権者${rec.creditors.length}件）`,
      metadata: { externalId: c.externalId, source: 'intake-csv' },
    })
  }

  return { status: 200, body: { ok: true, created } }
}
