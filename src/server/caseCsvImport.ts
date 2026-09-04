/**
 * CSVの再取込（出力したCSVを直して戻し、まとめて更新する）。
 *
 * 事務所からのご要望（2026-09-03）:
 *   「特定案件のみを絞込み、該当案件だけをCSV出力し、出力時に出力するフィールド
 *     （もしくはテーブル）を選択できるようにしてほしい。
 *     また、CSVファイルを修正後、再度取り込みを実施し、
 *     読み込んだファイルの値に一括で更新したい」
 *   併せて確認したこと:
 *     ・既存データを出力するので、内部IDが空の行は存在しない
 *       → **新規作成はしない。行を足しても取り込まない**
 *     ・実行できるのは全員 / 件数の上限は設けない
 *
 * 突合のしかた:
 *   出力CSVは【案件ID】【債権者ID】【入金ID】【接触履歴ID】を必ず先頭に出す。
 *   取込はこの内部IDだけで行を決める。ID（118823E 等）や氏名・債権者名は
 *   事務所側で直されることがあるためキーにできない。
 *
 * 1行の読み方（出力の形と対になっている）:
 *   出力は「案件の列」＋「テーブルの列」で、1行＝テーブルの1行。
 *   なので取込も、その行のどのテーブルIDが入っているかで行の種類を決める。
 *     ・債権者IDが入っている  → その債権者の行
 *     ・入金IDが入っている    → その入金の行
 *     ・接触履歴IDが入っている→ その接触履歴の行
 *     ・どれも空              → 案件の項目だけの行
 *   案件の列は全部の行に繰り返し出ているので、同じ案件で値が食い違っていたら
 *   どちらが正しいか決められない。勝手に片方を採らず、その項目はエラーにする。
 *
 * 空欄の扱い:
 *   既定は **空欄は「変更しない」**。CSVを一部だけ直して戻す使い方が主で、
 *   空欄をそのまま「消す」と扱うと事故が大きいため。
 *   意図して消したいときは画面の「空欄の項目は空にする」を入れて実行する。
 *
 * 触らない列:
 *   ・【】付きの内部ID（突合キー）
 *   ・［計算］付き（差額・累計プール・経過日数・年齢）
 *   ・案件ID(externalId)以外の関連キー（caseId / creditorId）
 */
import { prisma } from './db.js'
import { writeAudit, type Actor } from './audit.js'
import { decodeCsvBytes, parseCsv } from './intakeImport.js'
import { isXlsx, parseXlsxToRows } from './xlsxLite.js'
import { FIELD_LABEL } from '../constants/fieldLabels.js'
import {
  CSV_TABLE_FIELDS,
  CSV_TABLE_NAME,
  CSV_TABLE_ORDER,
  csvHeaderLabel,
  type CsvTableKey,
} from '../constants/csvColumns.js'
import {
  CASE_FIELD_TYPE,
  CONTACT_FIELD_TYPE,
  CREDITOR_FIELD_TYPE,
  PAYMENT_FIELD_TYPE,
  caseDisplay,
  toCaseJson,
} from './handlers.js'

export type EntityName = 'Case' | 'Creditor' | 'Payment' | 'ContactHistory'

const ENTITY_OF: Record<CsvTableKey, EntityName> = {
  creditor: 'Creditor',
  payment: 'Payment',
  contact: 'ContactHistory',
}

const FIELD_TYPE: Record<EntityName, Record<string, string>> = {
  Case: CASE_FIELD_TYPE,
  Creditor: CREDITOR_FIELD_TYPE,
  Payment: PAYMENT_FIELD_TYPE,
  ContactHistory: CONTACT_FIELD_TYPE,
}

/**
 * 中身は年月日だが列は文字列の項目（kintone 由来。schema.prisma のコメント参照）。
 * Excel で開くと「2026/5/31」に化けることがあるので YYYY-MM-DD に直してから入れる。
 */
const TEXT_DATE_COLUMNS = new Set(['paymentStartMonth', 'finalPaymentMonth'])

export interface ImportOptions {
  /** true のとき、空欄のセルはその項目を空にする。既定（false）は「変更しない」 */
  blankClears?: boolean
}

/** 1つの項目の変更 */
export interface CellChange {
  /** CSVの見出し（事務所が見ている名前） */
  label: string
  /** DBの列名 */
  field: string
  before: unknown
  after: unknown
}

/** 更新される1行 */
export interface RowPlan {
  /** CSVの行番号（見出しを1行目とする） */
  line: number
  entity: EntityName
  entityId: number
  caseId: number
  /** 画面表示用（118823E 等） */
  externalId: string | null
  clientName: string | null
  /** 債権者名・入金予定日など、どの行かが分かる手がかり */
  hint: string | null
  changes: CellChange[]
}

/** 取り込めなかった行・列 */
export interface ImportProblem {
  /** CSVの行番号。見出しの問題は 1 */
  line: number
  message: string
}

/** 見出し1列ぶんの読み取り結果 */
export interface HeaderInfo {
  index: number
  label: string
  /** 使う場合の対象。使わない列は null */
  target: { entity: EntityName; field: string } | null
  /** 使わない理由 */
  reason: string | null
}

export interface ImportPlan {
  encoding: string
  /** 見出しを除いたデータ行数 */
  dataRows: number
  header: HeaderInfo[]
  /** 更新のある行だけ */
  rows: RowPlan[]
  /** 読めたが変更が無かった行 */
  unchanged: number
  problems: ImportProblem[]
  counts: Record<EntityName, number>
  /** 変更される項目の総数 */
  cells: number
  blankClears: boolean
}

// ── 値の読み取り ─────────────────────────────────────────────

/** 全角数字・カンマ・通貨記号を落として数値にする */
function toNumber(raw: string): number | null {
  const s = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s　¥￥円]/g, '')
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** 「2026/5/31」「2026-05-31」「2026年5月31日」を YYYY-MM-DD にする */
function toYmd(raw: string): string | null {
  const s = raw.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  const m = s.match(/^(\d{4})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})\s*日?$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** PostgreSQL の integer の範囲。kintone にはこれを超える金額が入っていた実績がある */
const INT4_MAX = 2147483647
const INT4_MIN = -2147483648

type Parsed = { ok: true; value: unknown } | { ok: false; message: string }

/** CSVの文字列を、その列の型のDB値に直す */
function parseCell(field: string, type: string, raw: string): Parsed {
  const v = raw.trim()
  if (v === '') return { ok: true, value: null }
  if (type === 'Int') {
    const n = toNumber(v)
    if (n == null) return { ok: false, message: `数値で入れてください（「${v}」）` }
    if (!Number.isInteger(n)) return { ok: false, message: `整数で入れてください（「${v}」）` }
    if (n > INT4_MAX || n < INT4_MIN) {
      return { ok: false, message: `桁が大きすぎます（「${v}」。上限は ${INT4_MAX.toLocaleString()}）` }
    }
    return { ok: true, value: n }
  }
  if (type === 'Float' || type === 'Decimal') {
    const n = toNumber(v)
    if (n == null) return { ok: false, message: `数値で入れてください（「${v}」）` }
    return { ok: true, value: n }
  }
  if (type === 'Boolean') {
    if (['はい', 'true', 'TRUE', '1', '○', '有'].includes(v)) return { ok: true, value: true }
    if (['いいえ', 'false', 'FALSE', '0', '×', '無'].includes(v)) return { ok: true, value: false }
    return { ok: false, message: `「はい」か「いいえ」で入れてください（「${v}」）` }
  }
  if (type === 'DateTime') {
    const ymd = toYmd(v)
    if (!ymd) return { ok: false, message: `日付は 2026-05-31 の形で入れてください（「${v}」）` }
    return { ok: true, value: new Date(`${ymd}T00:00:00.000Z`) }
  }
  // 文字列。中身が年月日の列だけは形をそろえる
  if (TEXT_DATE_COLUMNS.has(field)) {
    const ymd = toYmd(v)
    return { ok: true, value: ymd ?? v }
  }
  return { ok: true, value: v }
}

// ── 見出しの読み取り ──────────────────────────────────────────

/** 見出しの表記ゆれを吸収（前後の空白・全角空白） */
const normLabel = (s: string) => s.replace(/^﻿/, '').trim().replace(/　/g, ' ')

/**
 * 案件の「道順 → 見出し」を、実際の案件1件から作る。
 * 出力側（caseCsvExport）も同じ道順を使うので、これで必ず対になる。
 */
function buildCaseLabelMap(sample: Record<string, unknown>): Map<string, string[]> {
  // 見出し → その見出しが指す葉（列名）の候補
  const out = new Map<string, string[]>()
  const add = (leaf: string) => {
    const label = normLabel(csvHeaderLabel('case', leaf))
    const arr = out.get(label)
    if (arr) {
      if (!arr.includes(leaf)) arr.push(leaf)
    } else out.set(label, [leaf])
  }
  for (const [group, value] of Object.entries(sample)) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      add(group)
      continue
    }
    for (const leaf of Object.keys(value as Record<string, unknown>)) add(leaf)
  }
  return out
}

function buildHeader(headerRow: string[], caseLabels: Map<string, string[]>): HeaderInfo[] {
  // テーブル側の見出し → 対象
  const tableLabel = new Map<string, { entity: EntityName; field: string }>()
  const tableIdLabel = new Map<string, CsvTableKey>()
  for (const t of CSV_TABLE_ORDER) {
    for (const f of CSV_TABLE_FIELDS[t]) {
      const label = normLabel(csvHeaderLabel(t, f))
      if (f === 'id') tableIdLabel.set(label, t)
      else tableLabel.set(label, { entity: ENTITY_OF[t], field: f })
    }
  }
  const caseIdLabel = normLabel(csvHeaderLabel('case', 'id'))

  const seen = new Set<string>()
  return headerRow.map((rawLabel, index): HeaderInfo => {
    const label = normLabel(rawLabel)
    if (label === '') return { index, label, target: null, reason: '見出しが空の列' }
    if (seen.has(label)) {
      return { index, label, target: null, reason: '同じ見出しの列が2つ以上あるため読み飛ばし' }
    }
    seen.add(label)
    if (label === caseIdLabel || tableIdLabel.has(label)) {
      return { index, label, target: null, reason: '突合キー（変更しません）' }
    }
    if (label.endsWith('［計算］')) {
      return { index, label, target: null, reason: '他の値から計算している項目（変更できません）' }
    }
    const t = tableLabel.get(label)
    if (t) {
      if (!FIELD_TYPE[t.entity][t.field]) {
        return { index, label, target: null, reason: '変更できない項目' }
      }
      return { index, label, target: t, reason: null }
    }
    const leaves = caseLabels.get(label)
    if (leaves && leaves.length === 1) {
      const leaf = leaves[0]
      if (!CASE_FIELD_TYPE[leaf]) return { index, label, target: null, reason: '変更できない項目' }
      return { index, label, target: { entity: 'Case', field: leaf }, reason: null }
    }
    if (leaves && leaves.length > 1) {
      return { index, label, target: null, reason: '同じ名前の項目が複数あり、どれか決められない' }
    }
    return { index, label, target: null, reason: 'この名前の項目がありません' }
  })
}

// ── 下見（プレビュー）──────────────────────────────────────────

function readFile(buf: Buffer): { rows: string[][]; encoding: string } {
  if (isXlsx(buf)) return { rows: parseXlsxToRows(buf), encoding: 'xlsx' }
  const dec = decodeCsvBytes(buf)
  return { rows: parseCsv(dec.text), encoding: dec.encoding }
}

const emptyCounts = (): Record<EntityName, number> => ({
  Case: 0,
  Creditor: 0,
  Payment: 0,
  ContactHistory: 0,
})

export async function planCaseCsvImport(
  buf: Buffer,
  opt: ImportOptions = {}
): Promise<ImportPlan> {
  const blankClears = opt.blankClears === true
  const { rows, encoding } = readFile(buf)
  const problems: ImportProblem[] = []
  const empty: ImportPlan = {
    encoding,
    dataRows: 0,
    header: [],
    rows: [],
    unchanged: 0,
    problems,
    counts: emptyCounts(),
    cells: 0,
    blankClears,
  }
  if (rows.length === 0) {
    problems.push({ line: 1, message: 'ファイルが空です' })
    return empty
  }

  // 見出しの解釈には案件1件の形が要る（案件の項目は入れ子のため）
  const sampleCase = await prisma.case.findFirst({ orderBy: { id: 'asc' } })
  if (!sampleCase) {
    problems.push({ line: 1, message: '案件が1件もないため取り込めません' })
    return empty
  }
  const caseLabels = buildCaseLabelMap(
    toCaseJson(sampleCase as unknown as Record<string, unknown>) as Record<string, unknown>
  )
  const header = buildHeader(rows[0], caseLabels)
  empty.header = header

  const caseIdCol = rows[0].findIndex((h) => normLabel(h) === normLabel(csvHeaderLabel('case', 'id')))
  if (caseIdCol < 0) {
    problems.push({
      line: 1,
      message: `「${csvHeaderLabel('case', 'id')}」の列がありません。この画面のCSV出力で作ったファイルを取り込んでください`,
    })
    return empty
  }
  const tableIdCol: Partial<Record<CsvTableKey, number>> = {}
  for (const t of CSV_TABLE_ORDER) {
    const label = normLabel(csvHeaderLabel(t, 'id'))
    const i = rows[0].findIndex((h) => normLabel(h) === label)
    if (i >= 0) tableIdCol[t] = i
  }
  if (header.every((h) => h.target == null)) {
    problems.push({ line: 1, message: '更新できる項目の列がありません' })
    return empty
  }

  // ── 行を「どのテーブルの何番か」に振り分ける ──
  type Pending = { line: number; entity: EntityName; id: number; caseId: number; values: Map<string, string> }
  const pending: Pending[] = []
  // 案件は複数行に同じ値が繰り返し出るので、行ごとに集めてから突き合わせる
  const caseRows = new Map<number, { line: number; values: Map<string, string> }[]>()
  const data = rows.slice(1)

  for (let i = 0; i < data.length; i++) {
    const line = i + 2
    const row = data[i]
    if (row.every((c) => (c ?? '').trim() === '')) continue

    const caseIdRaw = (row[caseIdCol] ?? '').trim()
    if (caseIdRaw === '') {
      problems.push({ line, message: '案件IDが空です（行の追加は取り込みません）' })
      continue
    }
    const caseId = Number(caseIdRaw)
    if (!Number.isInteger(caseId) || caseId <= 0) {
      problems.push({ line, message: `案件IDが数字ではありません（「${caseIdRaw}」）` })
      continue
    }

    // どのテーブルの行か
    const filled: CsvTableKey[] = []
    for (const t of CSV_TABLE_ORDER) {
      const c = tableIdCol[t]
      if (c != null && (row[c] ?? '').trim() !== '') filled.push(t)
    }
    if (filled.length > 1) {
      problems.push({
        line,
        message: `${filled.map((t) => CSV_TABLE_NAME[t]).join('と')}のIDが同じ行に入っています。1行につき1つのテーブルにしてください`,
      })
      continue
    }

    // 案件の列（どの行にも入っている）
    const caseValues = new Map<string, string>()
    for (const h of header) {
      if (h.target?.entity !== 'Case') continue
      caseValues.set(h.target.field, row[h.index] ?? '')
    }
    if (caseValues.size > 0) {
      const arr = caseRows.get(caseId)
      if (arr) arr.push({ line, values: caseValues })
      else caseRows.set(caseId, [{ line, values: caseValues }])
    }

    if (filled.length === 1) {
      const t = filled[0]
      const idRaw = (row[tableIdCol[t]!] ?? '').trim()
      const id = Number(idRaw)
      if (!Number.isInteger(id) || id <= 0) {
        problems.push({ line, message: `${CSV_TABLE_NAME[t]}IDが数字ではありません（「${idRaw}」）` })
        continue
      }
      const values = new Map<string, string>()
      for (const h of header) {
        if (h.target == null || h.target.entity !== ENTITY_OF[t]) continue
        values.set(h.target.field, row[h.index] ?? '')
      }
      if (values.size > 0) {
        pending.push({ line, entity: ENTITY_OF[t], id, caseId, values })
      }
    }
  }

  // ── 案件の値が行ごとに食い違っていないか ──
  const caseFinal = new Map<number, { line: number; values: Map<string, string> }>()
  for (const [caseId, list] of caseRows) {
    const first = list[0]
    const bad = new Set<string>()
    for (const other of list.slice(1)) {
      for (const [f, v] of other.values) {
        if ((first.values.get(f) ?? '') !== v) bad.add(f)
      }
    }
    for (const f of bad) {
      first.values.delete(f)
      problems.push({
        line: first.line,
        message: `案件${caseId} の「${csvHeaderLabel('case', f)}」が行によって違う値になっています（取り込みません）`,
      })
    }
    if (first.values.size > 0) caseFinal.set(caseId, first)
  }

  // ── 現在の値を読み、差分を作る ──
  const plan: RowPlan[] = []
  const counts = emptyCounts()
  let unchanged = 0
  let cells = 0

  const caseIds = [...new Set([...caseFinal.keys(), ...pending.map((p) => p.caseId)])]
  const caseById = new Map<number, Record<string, unknown>>()
  for (let i = 0; i < caseIds.length; i += 500) {
    const chunk = await prisma.case.findMany({ where: { id: { in: caseIds.slice(i, i + 500) } } })
    for (const c of chunk) caseById.set(c.id, c as unknown as Record<string, unknown>)
  }

  const rowById: Record<EntityName, Map<number, Record<string, unknown>>> = {
    Case: caseById,
    Creditor: new Map(),
    Payment: new Map(),
    ContactHistory: new Map(),
  }
  for (const t of CSV_TABLE_ORDER) {
    const entity = ENTITY_OF[t]
    const ids = [...new Set(pending.filter((p) => p.entity === entity).map((p) => p.id))]
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500)
      const found =
        entity === 'Creditor'
          ? await prisma.creditor.findMany({ where: { id: { in: slice } } })
          : entity === 'Payment'
            ? await prisma.payment.findMany({ where: { id: { in: slice } } })
            : await prisma.contactHistory.findMany({ where: { id: { in: slice } } })
      for (const r of found) rowById[entity].set(r.id, r as unknown as Record<string, unknown>)
    }
  }

  const describe = (caseId: number) => {
    const c = caseById.get(caseId)
    return {
      externalId: (c?.externalId as string | null) ?? null,
      clientName: (c?.name as string | null) ?? null,
    }
  }

  /** 1行ぶんの差分を作る（対象が無ければ null） */
  const diffRow = (
    line: number,
    entity: EntityName,
    id: number,
    caseId: number,
    values: Map<string, string>,
    hint: string | null
  ): RowPlan | null => {
    const current = rowById[entity].get(id)
    if (!current) {
      problems.push({
        line,
        message:
          entity === 'Case'
            ? `案件ID ${id} が見つかりません`
            : `${CSV_TABLE_NAME[(Object.keys(ENTITY_OF) as CsvTableKey[]).find((k) => ENTITY_OF[k] === entity)!]}ID ${id} が見つかりません`,
      })
      return null
    }
    if (entity !== 'Case' && Number(current.caseId) !== caseId) {
      problems.push({
        line,
        message: `内部IDと案件IDの組み合わせが合いません（案件${caseId} の行ではありません）`,
      })
      return null
    }
    const changes: CellChange[] = []
    for (const [field, raw] of values) {
      const type = FIELD_TYPE[entity][field]
      if (!type) continue
      if (raw.trim() === '' && !blankClears) continue
      const parsed = parseCell(field, type, raw)
      if (!parsed.ok) {
        problems.push({ line, message: `「${csvHeaderLabel(entityKind(entity), field)}」${parsed.message}` })
        continue
      }
      const before = caseDisplay(type, current[field])
      const after = caseDisplay(type, parsed.value)
      if (JSON.stringify(before) === JSON.stringify(after)) continue
      changes.push({ label: csvHeaderLabel(entityKind(entity), field), field, before, after })
    }
    if (changes.length === 0) {
      unchanged += 1
      return null
    }
    const d = describe(caseId)
    counts[entity] += 1
    cells += changes.length
    return { line, entity, entityId: id, caseId, externalId: d.externalId, clientName: d.clientName, hint, changes }
  }

  for (const [caseId, r] of caseFinal) {
    const p = diffRow(r.line, 'Case', caseId, caseId, r.values, null)
    if (p) plan.push(p)
  }
  for (const p of pending) {
    const current = rowById[p.entity].get(p.id)
    const hint =
      p.entity === 'Creditor'
        ? ((current?.creditorName as string | null) ?? null)
        : p.entity === 'Payment'
          ? dateHint(current?.plannedDate) ?? dateHint(current?.actualDate)
          : dateHint(current?.contactDate)
    const r = diffRow(p.line, p.entity, p.id, p.caseId, p.values, hint)
    if (r) plan.push(r)
  }
  plan.sort((a, b) => a.line - b.line)

  return {
    encoding,
    dataRows: data.length,
    header,
    rows: plan,
    unchanged,
    problems,
    counts,
    cells,
    blankClears,
  }
}

function dateHint(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return null
}

function entityKind(entity: EntityName): string {
  if (entity === 'Case') return 'case'
  return (Object.keys(ENTITY_OF) as CsvTableKey[]).find((k) => ENTITY_OF[k] === entity) ?? 'case'
}

// ── 実行 ────────────────────────────────────────────────────

export interface CommitResult {
  ok: boolean
  /** 更新した行数 */
  updated: Record<EntityName, number>
  /** 更新した項目数 */
  cells: number
  problems: ImportProblem[]
  error?: string
}

/**
 * 取り込みを実行する。
 * 下見と同じ計算をこの場でやり直す（画面から送られた差分は信用しない）。
 * 変更は1行ずつ変更履歴に残すので、あとから「このバージョンに戻す」で戻せる。
 */
export async function commitCaseCsvImport(
  actor: Actor & { id?: string | null; email?: string | null },
  buf: Buffer,
  opt: ImportOptions = {},
  meta: { ip?: string | null; userAgent?: string | null } = {}
): Promise<CommitResult> {
  const plan = await planCaseCsvImport(buf, opt)
  const updated = emptyCounts()
  let cells = 0

  const CHUNK = 25
  for (let i = 0; i < plan.rows.length; i += CHUNK) {
    const chunk = plan.rows.slice(i, i + CHUNK)
    await prisma.$transaction(async (tx) => {
      for (const r of chunk) {
        const type = FIELD_TYPE[r.entity]
        const data: Record<string, unknown> = {}
        const before: Record<string, unknown> = {}
        const after: Record<string, unknown> = {}
        for (const c of r.changes) {
          data[c.field] = toDbValue(type[c.field], c.after)
          before[c.field] = c.before
          after[c.field] = c.after
        }
        if (r.entity === 'Case') {
          data.updatedBy = actor.email ?? null
          await tx.case.update({ where: { id: r.entityId }, data })
        } else if (r.entity === 'Creditor') {
          await tx.creditor.update({ where: { id: r.entityId }, data })
        } else if (r.entity === 'Payment') {
          await tx.payment.update({ where: { id: r.entityId }, data })
        } else {
          await tx.contactHistory.update({ where: { id: r.entityId }, data })
        }
        await tx.changeLog.create({
          data: {
            actorId: actor.id ?? null,
            actorEmail: actor.email ?? null,
            entity: r.entity,
            entityId: String(r.entityId),
            action: 'UPDATE',
            before: before as never,
            after: after as never,
          },
        })
        updated[r.entity] += 1
        cells += r.changes.length
      }
    })
  }

  /*
    案件単位でも「CSVの再取込で更新した」ことを1件残す。
    項目ごとの履歴は上で1行ずつ残しているが、それだけだと画面上は手で直したのと
    区別がつかない。田中様のご指摘「全ての更新は、変更履歴に残して欲しい」に沿い、
    どの更新がCSV取込によるものかを追えるようにしておく。
    債権者・入金の行だけが変わった案件にも付ける（案件本体だけの変更は重複するので付けない）。
  */
  const byCase = new Map<number, RowPlan[]>()
  for (const r of plan.rows) {
    const arr = byCase.get(r.caseId)
    if (arr) arr.push(r)
    else byCase.set(r.caseId, [r])
  }
  const summaries: {
    actorId: string | null
    actorEmail: string | null
    entity: string
    entityId: string
    action: 'UPDATE'
    before: unknown
    after: unknown
  }[] = []
  for (const [caseId, rows] of byCase) {
    if (rows.length === 1 && rows[0].entity === 'Case') continue
    summaries.push({
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      entity: 'Case',
      entityId: String(caseId),
      action: 'UPDATE',
      before: { csvImport: null },
      after: {
        csvImport: rows
          .map(
            (r) =>
              `${labelOfEntity(r.entity)}${r.entityId}：${r.changes
                .map((c) => FIELD_LABEL[c.field] ?? c.field)
                .join('・')}`
          )
          .join(' / '),
      },
    })
  }
  for (let i = 0; i < summaries.length; i += 200) {
    await prisma.changeLog.createMany({ data: summaries.slice(i, i + 200) as never })
  }

  await writeAudit({
    actor,
    action: 'UPDATE',
    entity: 'Case',
    summary: `CSV再取込（${plan.rows.length}行・${cells}項目を更新）`,
    metadata: { updated, cells, problems: plan.problems.length, blankClears: plan.blankClears },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return { ok: true, updated, cells, problems: plan.problems }
}

function labelOfEntity(e: EntityName): string {
  return e === 'Case' ? '案件' : CSV_TABLE_NAME[entityKind(e) as CsvTableKey]
}

/** 表示用に直した値（変更履歴の形）を、DBに入れる値へ戻す */
function toDbValue(type: string, display: unknown): unknown {
  if (display == null) return null
  if (type === 'DateTime') return new Date(`${String(display)}T00:00:00.000Z`)
  return display
}
