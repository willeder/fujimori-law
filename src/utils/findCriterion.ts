/**
 * 検索モードの比較条件パーサ（クライアント/サーバ共用）。
 * 記号式のみサポート:
 *   >=100000  <=100000  >100000  <100000  =100000     … 数値の以上/以下/超/未満/一致
 *   100000..200000  100000〜200000                     … 数値の範囲（両端含む）
 *   >=2026-04-01  <2026-07-01  =2026-06-30            … 日付の比較（YYYY-MM-DD / YYYY/M/D）
 *   2026-04-01..2026-06-30  2026-04-01〜2026-06-30    … 日付の範囲（両端含む）
 * カンマ・空白・「円」・全角記号（≥ ≤ ＞ ＜ ＝ 〜 全角数字）を許容。
 * 比較式でなければ null を返し、呼び出し側は部分一致にフォールバックする。
 */
export type CompareOp = '>' | '<' | '>=' | '<=' | '='

export type FindCriterion =
  | { kind: 'num'; op: CompareOp; n: number }
  | { kind: 'num-range'; n: number; n2: number }
  | { kind: 'date'; op: CompareOp; d: string } // d は 'YYYY-MM-DD'
  | { kind: 'date-range'; d: string; d2: string }

/** 全角→半角などの正規化（数字・記号） */
function normalize(v: string): string {
  return v
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，,\s円]/g, '')
    .replace(/≥|＞＝/g, '>=')
    .replace(/≤|＜＝/g, '<=')
    .replace(/＞/g, '>')
    .replace(/＜/g, '<')
    .replace(/＝/g, '=')
    .replace(/[〜～]/g, '..')
    .replace(/[／]/g, '/')
    .replace(/[－ー]/g, '-')
}

const DATE_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/
const MONTH_RE = /^(\d{4})[-/](\d{1,2})$/

/** 'YYYY-MM-DD' / 'YYYY/M/D' → 'YYYY-MM-DD'（不正なら null） */
export function toIsoDate(s: string): string | null {
  const m = s.match(DATE_RE)
  if (!m) return null
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 'YYYY-MM' / 'YYYY/M' → その月の初日〜末日（月指定。例: 2026/08 → 08-01..08-31）。不正なら null */
function toMonthRange(s: string): { d: string; d2: string } | null {
  const m = s.match(MONTH_RE)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate() // 翌月0日=当月末
  const mm = String(mo).padStart(2, '0')
  return { d: `${m[1]}-${mm}-01`, d2: `${m[1]}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

/** 範囲の左右どちらにも「日付」または「月」を許容し、日付範囲の端に正規化する */
function toRangeEdge(s: string, edge: 'start' | 'end'): string | null {
  const d = toIsoDate(s)
  if (d) return d
  const mr = toMonthRange(s)
  if (mr) return edge === 'start' ? mr.d : mr.d2
  return null
}

export function parseFindCriterion(v: string): FindCriterion | null {
  const t = normalize(v)

  // 片側だけの範囲（以降/以前。端の値を含む）
  //   a..  → a以降（例: 2026/08..  → 2026-08-01以降 ＝ 8月を含む）
  //   ..b  → b以前（例: ..2026/08 → 2026-08-31以前 ＝ 8月を含む）
  const open = t.split('..')
  if (open.length === 2 && (open[0] === '') !== (open[1] === '')) {
    const isFrom = open[1] === '' // a.. 形式
    const side = isFrom ? open[0] : open[1]
    const d = toRangeEdge(side, isFrom ? 'start' : 'end')
    if (d) return { kind: 'date', op: isFrom ? '>=' : '<=', d }
    if (/^-?\d+(\.\d+)?$/.test(side)) {
      return { kind: 'num', op: isFrom ? '>=' : '<=', n: Number(side) }
    }
    return null
  }

  // 範囲 a..b （日付優先で判定。月指定 YYYY-MM も端に使用可: 2026/07..2026/09 → 07-01..09-30）
  const range = t.split('..')
  if (range.length === 2 && range[0] !== '' && range[1] !== '') {
    const d1 = toRangeEdge(range[0], 'start')
    const d2 = toRangeEdge(range[1], 'end')
    if (d1 && d2) {
      return d1 <= d2 ? { kind: 'date-range', d: d1, d2 } : { kind: 'date-range', d: d2, d2: d1 }
    }
    if (/^-?\d+(\.\d+)?$/.test(range[0]) && /^-?\d+(\.\d+)?$/.test(range[1])) {
      const n = Number(range[0])
      const n2 = Number(range[1])
      return { kind: 'num-range', n: Math.min(n, n2), n2: Math.max(n, n2) }
    }
    return null
  }

  // 単独比較 >=x <=x >x <x =x
  const m = t.match(/^(>=|<=|>|<|=)(.+)$/)
  if (m) {
    const op = m[1] as CompareOp
    const d = toIsoDate(m[2])
    if (d) return { kind: 'date', op, d }
    // 月指定の比較（>=2026/08 → 8/1以降、<=2026/08 → 8/31以前、=2026/08 → 8月中）
    const mr = toMonthRange(m[2])
    if (mr) {
      if (op === '=') return { kind: 'date-range', d: mr.d, d2: mr.d2 }
      if (op === '>=') return { kind: 'date', op: '>=', d: mr.d }
      if (op === '>') return { kind: 'date', op: '>', d: mr.d2 }
      if (op === '<=') return { kind: 'date', op: '<=', d: mr.d2 }
      return { kind: 'date', op: '<', d: mr.d }
    }
    if (/^-?\d+(\.\d+)?$/.test(m[2])) return { kind: 'num', op, n: Number(m[2]) }
    return null
  }

  // 演算子なしの月指定（2026/08 → その月の1日〜末日の範囲として絞込）
  const mr = toMonthRange(t)
  if (mr) return { kind: 'date-range', d: mr.d, d2: mr.d2 }

  return null
}

function cmp(op: CompareOp, a: number | string, b: number | string): boolean {
  switch (op) {
    case '>':
      return a > b
    case '<':
      return a < b
    case '>=':
      return a >= b
    case '<=':
      return a <= b
    case '=':
      return a === b
  }
}

/** 数値セル値のマッチ判定（数値系条件のみ） */
export function matchNumber(cv: number, c: FindCriterion): boolean {
  if (c.kind === 'num') return cmp(c.op, cv, c.n)
  if (c.kind === 'num-range') return cv >= c.n && cv <= c.n2
  return false
}

/** 日付セル値（'YYYY-MM-DD'）のマッチ判定（日付系条件のみ） */
export function matchDate(cellIso: string, c: FindCriterion): boolean {
  if (c.kind === 'date') return cmp(c.op, cellIso, c.d)
  if (c.kind === 'date-range') return cellIso >= c.d && cellIso <= c.d2
  return false
}

/** セル文字列から日付部分を抽出して 'YYYY-MM-DD' に（無ければ null） */
export function extractIsoDate(text: string): string | null {
  const m = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  return m ? toIsoDate(m[0]) : null
}
