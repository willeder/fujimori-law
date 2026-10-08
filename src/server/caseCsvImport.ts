/**
 * CSVの再取込（出力したCSVを直して戻し、まとめて更新する）。
 *
 * 事務所からのご要望（2026-09-03）:
 *   「特定案件のみを絞込み、該当案件だけをCSV出力し、出力時に出力するフィールド
 *     （もしくはテーブル）を選択できるようにしてほしい。
 *     また、CSVファイルを修正後、再度取り込みを実施し、
 *     読み込んだファイルの値に一括で更新したい」
 *   併せて確認したこと:
 *     ・実行できるのは全員 / 件数の上限は設けない
 *
 * 行の追加（2026-10-01 田中様からのご要望で仕様変更）:
 *   「CSV出力 → 修正、追加 → CSV取込 の工程は頻度が多く、増やした行も取り込みたい。
 *     kintone では案件IDを軸に取込をしていた」
 *   当初（2026-09-03）は「新規作成はしない。行を足しても取り込まない」としていたが、
 *   入金予定を足す等で行の追加が日常的に発生するため、追加も取り込めるようにした。
 *     ・テーブルの内部ID（【入金ID】等）が **空欄** の行 → 【案件ID】の案件に **新規追加**
 *     ・内部IDが入っている行 → これまでどおりその行を更新
 *   既存の行を「案件IDだけ」で決めることはできない（1案件に入金が数十〜百行ある）ため、
 *   更新の突合は内部IDのまま。ただし【案件ID】を軸にして、次のように扱う。
 *     ・内部IDがその【案件ID】の案件の行 → 更新
 *     ・内部IDが別の案件の行／存在しない → **追加**（別の案件の行は書き換えない）
 *       実例（2026-10-02 受領CSV）: 案件237の入金60行の下に Excel のオートフィルで
 *       6行足したところ、【入金ID】が 588001〜588006 と連番で埋まり、それが
 *       隣の案件238の入金IDだったため「組み合わせが合いません」で弾かれていた。
 *       オートフィルは日常的に使われるので、案件IDを優先して追加として扱う。
 *     ・同じ内部IDがファイル内に2回以上出てくる → 取り込まずに知らせる
 *       （コピーした行のどちらを更新とすべきか決められないため）
 *
 * 行の削除（入金スケジュールのみ。2026-10-08 田中様のご要望・Rei 確認済み）:
 *   「取込時に行数が少ない場合は、それ以降は行削除をお願いしたい」
 *   CSVに入金の列があり、その案件の行がCSVに1行でもあるとき、
 *   その案件の入金のうち **CSVに【入金ID】が出てこない行は削除** する（＝CSVの内容で置き換える）。
 *     ・削除とみなすのは「行そのものを消した」場合だけ。値を空欄にした行は削除しない
 *     ・実入金日／実入金額が入っている行（入金済み）は削除せず、取り込めない行として知らせる
 *     ・【案件ID】や【入金ID】が読めない行があるときは、取りこぼしで誤って消さないよう
 *       その案件（案件IDが読めない場合はファイル全体）の削除を行わない
 *     ・削除される行は確認画面に一覧で出し、確認のうえ実行してもらう
 *   債権者・接触履歴は削除しない（「とりあえず入金スケジュールのみ」）。
 *
 * 突合のしかた:
 *   出力CSVは【案件ID】【債権者ID】【入金ID】【接触履歴ID】を必ず先頭に出す。
 *   既存の行の更新はこの内部IDだけで行を決める。ID（118823E 等）や氏名・債権者名は
 *   事務所側で直されることがあるためキーにできない。
 *
 * 1行の読み方（出力の形と対になっている）:
 *   出力は「案件の列」＋「テーブルの列」で、1行＝テーブルの1行。
 *   なので取込も、その行のどのテーブルIDが入っているかで行の種類を決める。
 *     ・債権者IDが入っている  → その債権者の行
 *     ・入金IDが入っている    → その入金の行
 *     ・接触履歴IDが入っている→ その接触履歴の行
 *     ・どれも空で、あるテーブルの項目に値がある → そのテーブルに新規追加する行
 *     ・どれも空で、テーブルの項目も空          → 案件の項目だけの行
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

/** 更新（または追加）される1行 */
export interface RowPlan {
  /** CSVの行番号（見出しを1行目とする） */
  line: number
  /** update: 既存の行を更新 / create: 新しい行を追加 / delete: CSVに無い行を削除（入金のみ） */
  action: 'update' | 'create' | 'delete'
  entity: EntityName
  /** 追加の行は 0（取り込み実行後に決まる） */
  entityId: number
  caseId: number
  /** 画面表示用（118823E 等） */
  externalId: string | null
  /** 補足（内部IDを読み替えて追加にした理由など） */
  note?: string | null
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
  /** 更新・追加のある行だけ */
  rows: RowPlan[]
  /** 読めたが変更が無かった行 */
  unchanged: number
  problems: ImportProblem[]
  /** 更新される行数 */
  counts: Record<EntityName, number>
  /** 追加される行数 */
  created: Record<EntityName, number>
  /** 削除される行数（入金のみ） */
  deleted: Record<EntityName, number>
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
  // 接触履歴の「対象」は enum。出力は CLIENT / CREDITOR だが、日本語で直されても受ける
  if (field === 'targetType') {
    if (v === 'CREDITOR' || v === '債権者') return { ok: true, value: 'CREDITOR' }
    if (v === 'CLIENT' || v === '依頼者') return { ok: true, value: 'CLIENT' }
    return { ok: false, message: `「依頼者」か「債権者」で入れてください（「${v}」）` }
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
    created: emptyCounts(),
    deleted: emptyCounts(),
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
  // 入金の「債権者」の紐づけ（任意）。通常の更新では触らない列だが、追加の行では使う
  const paymentCreditorCol = rows[0].findIndex(
    (h) => normLabel(h) === normLabel(csvHeaderLabel('payment', 'creditorId'))
  )
  if (header.every((h) => h.target == null)) {
    problems.push({ line: 1, message: '更新できる項目の列がありません' })
    return empty
  }

  // ── 行を「どのテーブルの何番か」に振り分ける ──
  type Pending = {
    line: number
    entity: EntityName
    /** 追加の行は 0 */
    id: number
    caseId: number
    values: Map<string, string>
    isNew: boolean
    /** 入金のみ：債権者の内部ID（文字列のまま。追加のときだけ使う） */
    creditorIdRaw?: string
    /** 内部IDを読み替えて追加にしたときの説明 */
    note?: string
  }
  const pending: Pending[] = []
  // 同じ内部IDが2回出てきたら、コピーで足した行の消し忘れとみなして止める
  const firstLineOf = new Map<string, number>()
  // 行削除（入金）のための記録。CSVに出てきた【入金ID】と、対象の案件
  const paymentRefs = new Map<number, Set<number>>()
  const paymentCaseLines = new Map<number, number>()
  const noDeleteCases = new Set<number>()
  let noDeleteAll = false
  const paymentInCsv = tableIdCol.payment != null
  // 案件は複数行に同じ値が繰り返し出るので、行ごとに集めてから突き合わせる
  const caseRows = new Map<number, { line: number; values: Map<string, string> }[]>()
  const data = rows.slice(1)

  for (let i = 0; i < data.length; i++) {
    const line = i + 2
    const row = data[i]
    if (row.every((c) => (c ?? '').trim() === '')) continue

    const caseIdRaw = (row[caseIdCol] ?? '').trim()
    if (caseIdRaw === '') {
      problems.push({
        line,
        message: `${csvHeaderLabel('case', 'id')}が空です。行を追加するときも、追加先の案件の${csvHeaderLabel('case', 'id')}を入れてください`,
      })
      noDeleteAll = true
      continue
    }
    const caseId = Number(caseIdRaw)
    if (!Number.isInteger(caseId) || caseId <= 0) {
      problems.push({ line, message: `案件IDが数字ではありません（「${caseIdRaw}」）` })
      noDeleteAll = true
      continue
    }
    if (paymentInCsv) {
      // この案件の入金はCSVの内容で置き換える対象（最後の行番号を覚えて削除行の表示位置にする）
      paymentCaseLines.set(caseId, line)
      const pidRaw = (row[tableIdCol.payment!] ?? '').trim()
      if (pidRaw !== '') {
        const pid = Number(pidRaw)
        if (Number.isInteger(pid) && pid > 0) {
          const set = paymentRefs.get(caseId)
          if (set) set.add(pid)
          else paymentRefs.set(caseId, new Set([pid]))
        } else {
          noDeleteCases.add(caseId)
        }
      }
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

    // 内部IDがどれも空 → テーブルの項目に値があれば「追加の行」
    let newTable: CsvTableKey | null = null
    if (filled.length === 0) {
      const withValues = CSV_TABLE_ORDER.filter(
        (t) =>
          tableIdCol[t] != null &&
          header.some(
            (h) => h.target?.entity === ENTITY_OF[t] && (row[h.index] ?? '').trim() !== ''
          )
      )
      if (withValues.length > 1) {
        problems.push({
          line,
          message: `${withValues.map((t) => CSV_TABLE_NAME[t]).join('と')}の項目が同じ行に入っています。追加する行は1行につき1つのテーブルにしてください`,
        })
        continue
      }
      newTable = withValues[0] ?? null
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
      const key = `${t}:${id}`
      const firstLine = firstLineOf.get(key)
      if (firstLine != null) {
        problems.push({
          line,
          message: `${csvHeaderLabel(t, 'id')} ${id} が ${firstLine}行目と同じです。行を追加する場合は${csvHeaderLabel(t, 'id')}を空欄にしてください`,
        })
        continue
      }
      firstLineOf.set(key, line)
      const values = new Map<string, string>()
      for (const h of header) {
        if (h.target == null || h.target.entity !== ENTITY_OF[t]) continue
        values.set(h.target.field, row[h.index] ?? '')
      }
      if (values.size > 0) {
        pending.push({
          line,
          entity: ENTITY_OF[t],
          id,
          caseId,
          values,
          isNew: false,
          creditorIdRaw:
            t === 'payment' && paymentCreditorCol >= 0
              ? (row[paymentCreditorCol] ?? '').trim()
              : undefined,
        })
      }
    } else if (newTable) {
      const values = new Map<string, string>()
      for (const h of header) {
        if (h.target == null || h.target.entity !== ENTITY_OF[newTable]) continue
        values.set(h.target.field, row[h.index] ?? '')
      }
      pending.push({
        line,
        entity: ENTITY_OF[newTable],
        id: 0,
        caseId,
        values,
        isNew: true,
        creditorIdRaw:
          newTable === 'payment' && paymentCreditorCol >= 0
            ? (row[paymentCreditorCol] ?? '').trim()
            : undefined,
      })
    }
  }

  // ── 案件の値が行ごとに食い違っていないか ──
  // 空欄は既定で「変更しない」なので、食い違いの判定にも入れない。
  // （追加した行で案件の列を空のままにしても、既存の行の値と食い違い扱いにしない）
  const caseFinal = new Map<number, { line: number; values: Map<string, string> }>()
  for (const [caseId, list] of caseRows) {
    const merged = new Map<string, string>()
    const blankSeen = new Set<string>()
    const bad = new Set<string>()
    for (const r of list) {
      for (const [f, v] of r.values) {
        if (v.trim() === '') {
          blankSeen.add(f)
          continue
        }
        const prev = merged.get(f)
        if (prev === undefined) merged.set(f, v)
        else if (prev !== v) bad.add(f)
      }
    }
    if (blankClears) {
      // 「空欄は空にする」のときは、空欄と値が混ざっていたらどちらか決められない
      for (const f of blankSeen) {
        if (merged.has(f)) bad.add(f)
        else merged.set(f, '')
      }
    }
    for (const f of bad) {
      merged.delete(f)
      problems.push({
        line: list[0].line,
        message: `案件${caseId} の「${csvHeaderLabel('case', f)}」が行によって違う値になっています（取り込みません）`,
      })
    }
    if (merged.size > 0) caseFinal.set(caseId, { line: list[0].line, values: merged })
  }

  // ── 現在の値を読み、差分を作る ──
  const plan: RowPlan[] = []
  const counts = emptyCounts()
  const created = emptyCounts()
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
    const ids = [
      ...new Set(pending.filter((p) => p.entity === entity && !p.isNew).map((p) => p.id)),
    ]
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

  // 内部IDが別の案件の行・存在しない行は、【案件ID】の案件への追加として扱う
  // （オートフィル等で内部IDが埋まってしまった追加行。先頭コメント参照）
  for (const p of pending) {
    if (p.isNew || p.entity === 'Case') continue
    const current = rowById[p.entity].get(p.id)
    const idLabel = csvHeaderLabel(entityKind(p.entity), 'id')
    if (!current) {
      p.note = `${idLabel} ${p.id} は見つからないため、新しい行として追加します`
    } else if (Number(current.caseId) !== p.caseId) {
      p.note = `${idLabel} ${p.id} は別の案件の行のため、新しい行として追加します（その行は変更しません）`
    } else {
      continue
    }
    p.isNew = true
    p.id = 0
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
      const idLabel = csvHeaderLabel(entityKind(entity), 'id')
      problems.push({
        line,
        message: `${idLabel} ${id} は${csvHeaderLabel('case', 'id')} ${caseId} の行ではありません。行を追加する場合は${idLabel}を空欄にしてください`,
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
    return {
      line,
      action: 'update',
      entity,
      entityId: id,
      caseId,
      externalId: d.externalId,
      clientName: d.clientName,
      hint,
      changes,
    }
  }

  // 入金の追加で債権者を指定されたとき、その債権者が同じ案件のものか確かめる
  const creditorCaseOf = new Map<number, number>()
  {
    const ids = [
      ...new Set(
        pending
          .filter((p) => p.isNew && p.creditorIdRaw)
          .map((p) => Number(p.creditorIdRaw))
          .filter((n) => Number.isInteger(n) && n > 0)
      ),
    ]
    for (let i = 0; i < ids.length; i += 500) {
      const found = await prisma.creditor.findMany({
        where: { id: { in: ids.slice(i, i + 500) } },
        select: { id: true, caseId: true },
      })
      for (const r of found) creditorCaseOf.set(r.id, r.caseId)
    }
  }

  /** 追加の1行を作る（取り込めなければ null） */
  const newRow = (p: Pending): RowPlan | null => {
    if (!caseById.has(p.caseId)) {
      problems.push({ line: p.line, message: `${csvHeaderLabel('case', 'id')} ${p.caseId} が見つかりません` })
      return null
    }
    const kind = entityKind(p.entity)
    const changes: CellChange[] = []
    let bad = false
    for (const [field, raw] of p.values) {
      const type = FIELD_TYPE[p.entity][field]
      if (!type) continue
      if (raw.trim() === '') continue
      const parsed = parseCell(field, type, raw)
      if (!parsed.ok) {
        problems.push({ line: p.line, message: `「${csvHeaderLabel(kind, field)}」${parsed.message}` })
        bad = true
        continue
      }
      changes.push({
        label: csvHeaderLabel(kind, field),
        field,
        before: null,
        after: caseDisplay(type, parsed.value),
      })
    }
    // 一部の項目が欠けたまま行だけ増えるのを避けるため、読めない項目があれば行ごと取り込まない
    if (bad) return null
    const has = (f: string) => changes.some((c) => c.field === f)

    if (p.entity === 'Creditor') {
      if (!has('creditorName')) {
        problems.push({
          line: p.line,
          message: `債権者を追加するには「${csvHeaderLabel('creditor', 'creditorName')}」が必要です`,
        })
        return null
      }
      // 画面からの追加（createCreditor）と同じ既定値
      if (!has('status')) {
        changes.push({ label: csvHeaderLabel('creditor', 'status'), field: 'status', before: null, after: '受任通知発送待ち' })
      }
    }
    if (p.entity === 'ContactHistory' && !has('targetType')) {
      changes.push({ label: csvHeaderLabel('contact', 'targetType'), field: 'targetType', before: null, after: 'CLIENT' })
    }
    if (p.entity === 'Payment' && p.creditorIdRaw) {
      const cid = Number(p.creditorIdRaw)
      if (!Number.isInteger(cid) || cid <= 0 || creditorCaseOf.get(cid) !== p.caseId) {
        problems.push({
          line: p.line,
          message: `「${csvHeaderLabel('payment', 'creditorId')}」${p.creditorIdRaw} はこの案件の債権者ではありません`,
        })
        return null
      }
      changes.push({ label: csvHeaderLabel('payment', 'creditorId'), field: 'creditorId', before: null, after: cid })
    }
    if (changes.length === 0) return null

    const d = describe(p.caseId)
    created[p.entity] += 1
    cells += changes.length
    const v = (f: string) => changes.find((c) => c.field === f)?.after
    const hint =
      p.entity === 'Creditor'
        ? ((v('creditorName') as string | undefined) ?? null)
        : p.entity === 'Payment'
          ? ((v('plannedDate') ?? v('actualDate')) as string | undefined) ?? null
          : ((v('contactDate') as string | undefined) ?? null)
    return {
      line: p.line,
      action: 'create',
      entity: p.entity,
      entityId: 0,
      caseId: p.caseId,
      externalId: d.externalId,
      clientName: d.clientName,
      hint,
      changes,
      note: p.note ?? null,
    }
  }

  for (const [caseId, r] of caseFinal) {
    const p = diffRow(r.line, 'Case', caseId, caseId, r.values, null)
    if (p) plan.push(p)
  }
  // ── CSVから消された入金の行を削除する（先頭コメント参照） ──
  const deleted = emptyCounts()
  if (paymentInCsv && paymentCaseLines.size > 0) {
    if (noDeleteAll) {
      problems.push({
        line: 1,
        message: `${csvHeaderLabel('case', 'id')}が読めない行があるため、入金の行の削除は行いません（その行を直してから取り込み直してください）`,
      })
    } else {
      const targetCases = [...paymentCaseLines.keys()].filter((c) => caseById.has(c))
      for (const c of noDeleteCases) {
        if (!paymentCaseLines.has(c)) continue
        problems.push({
          line: paymentCaseLines.get(c)!,
          message: `案件${caseById.get(c)?.externalId ?? c} は${csvHeaderLabel('payment', 'id')}が読めない行があるため、入金の行の削除は行いません`,
        })
      }
      const existing: Record<string, unknown>[] = []
      for (let i = 0; i < targetCases.length; i += 500) {
        const chunk = targetCases.slice(i, i + 500).filter((c) => !noDeleteCases.has(c))
        if (chunk.length === 0) continue
        const found = await prisma.payment.findMany({
          where: { caseId: { in: chunk } },
          orderBy: { id: 'asc' },
        })
        existing.push(...(found as unknown as Record<string, unknown>[]))
      }
      for (const row of existing) {
        const caseId = Number(row.caseId)
        const id = Number(row.id)
        if (paymentRefs.get(caseId)?.has(id)) continue
        const line = paymentCaseLines.get(caseId)!
        const planned = dateHint(row.plannedDate)
        if (row.actualDate != null || row.actualAmount != null) {
          problems.push({
            line,
            message: `案件${caseById.get(caseId)?.externalId ?? caseId} の入金（予定日 ${planned ?? '-'}）はCSVにありませんが、入金済みのため削除しません`,
          })
          continue
        }
        const d = describe(caseId)
        const changes: CellChange[] = [
          { label: csvHeaderLabel('payment', 'plannedDate'), field: 'plannedDate', before: planned, after: null },
          {
            label: csvHeaderLabel('payment', 'plannedAmount'),
            field: 'plannedAmount',
            before: row.plannedAmount ?? null,
            after: null,
          },
        ]
        deleted.Payment += 1
        plan.push({
          line,
          action: 'delete',
          entity: 'Payment',
          entityId: id,
          caseId,
          externalId: d.externalId,
          clientName: d.clientName,
          hint: planned,
          changes,
        })
      }
    }
  }

  for (const p of pending) {
    if (p.isNew) {
      const r = newRow(p)
      if (r) plan.push(r)
      continue
    }
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
  // 行番号順。同じ行番号なら 更新/追加 → 削除 の順（削除はその案件の最後の行の位置に並べる）
  plan.sort((a, b) => a.line - b.line || Number(a.action === 'delete') - Number(b.action === 'delete'))

  return {
    encoding,
    dataRows: data.length,
    header,
    rows: plan,
    unchanged,
    problems,
    counts,
    created,
    deleted,
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
  /** 追加した行数 */
  created: Record<EntityName, number>
  /** 削除した行数（入金のみ） */
  deleted: Record<EntityName, number>
  /**
   * 更新・追加のあった案件。取込後に案件ページへすぐ移れるようにするため
   * （田中様 2026-10-02「取り込んだ内容をすぐ確認できるよう、ワンクリックで依頼者の
   *   情報ページに移動したい」）
   */
  cases: { caseId: number; externalId: string | null; clientName: string | null }[]
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
  const created = emptyCounts()
  const deleted = emptyCounts()
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
        if (r.action === 'delete') {
          // 入金のみ。下見から実行までの間に入金されていたら消さない
          const cur = await tx.payment.findUnique({ where: { id: r.entityId } })
          if (!cur || cur.caseId !== r.caseId || cur.actualDate != null || cur.actualAmount != null) continue
          const snapshot: Record<string, unknown> = {}
          for (const col of Object.keys(PAYMENT_FIELD_TYPE)) {
            const v = caseDisplay(PAYMENT_FIELD_TYPE[col], (cur as unknown as Record<string, unknown>)[col])
            if (v != null && v !== '') snapshot[col] = v
          }
          // 画面からの削除（deleteRow）と同じく案件IDを残す。行が消えたあとも案件の変更履歴に出すため
          snapshot.caseId = cur.caseId
          await tx.payment.delete({ where: { id: r.entityId } })
          await tx.changeLog.create({
            data: {
              actorId: actor.id ?? null,
              actorEmail: actor.email ?? null,
              entity: 'Payment',
              entityId: String(r.entityId),
              action: 'DELETE',
              before: snapshot as never,
            },
          })
          deleted.Payment += 1
          continue
        }
        if (r.action === 'create') {
          data.caseId = r.caseId
          let row: { id: number }
          if (r.entity === 'Creditor') {
            // 表示順は末尾（画面からの追加と同じ）
            const max = await tx.creditor.aggregate({
              where: { caseId: r.caseId },
              _max: { displayOrder: true },
            })
            if (data.displayOrder == null) data.displayOrder = (max._max.displayOrder ?? 0) + 1
            row = await tx.creditor.create({ data: data as never })
          } else if (r.entity === 'Payment') {
            row = await tx.payment.create({ data: data as never })
          } else {
            row = await tx.contactHistory.create({ data: data as never })
          }
          r.entityId = row.id
          await tx.changeLog.create({
            data: {
              actorId: actor.id ?? null,
              actorEmail: actor.email ?? null,
              entity: r.entity,
              entityId: String(row.id),
              action: 'CREATE',
              // 画面からの追加（createRow）と同じ形：before は持たない
              after: after as never,
            },
          })
          created[r.entity] += 1
          cells += r.changes.length
          continue
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
              `${labelOfEntity(r.entity)}${r.entityId}${r.action === 'create' ? '（追加）' : r.action === 'delete' ? '（削除）' : ''}：${r.changes
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
    summary: `CSV再取込（更新${sum(updated)}行・追加${sum(created)}行・削除${sum(deleted)}行・${cells}項目）`,
    metadata: { updated, created, deleted, cells, problems: plan.problems.length, blankClears: plan.blankClears },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  const cases = [...byCase.entries()].map(([caseId, rows]) => ({
    caseId,
    externalId: rows[0].externalId,
    clientName: rows[0].clientName,
  }))
  return { ok: true, updated, created, deleted, cases, cells, problems: plan.problems }
}

const sum = (c: Record<EntityName, number>) => Object.values(c).reduce((a, b) => a + b, 0)

function labelOfEntity(e: EntityName): string {
  return e === 'Case' ? '案件' : CSV_TABLE_NAME[entityKind(e) as CsvTableKey]
}

/** 表示用に直した値（変更履歴の形）を、DBに入れる値へ戻す */
function toDbValue(type: string, display: unknown): unknown {
  if (display == null) return null
  if (type === 'DateTime') return new Date(`${String(display)}T00:00:00.000Z`)
  return display
}
