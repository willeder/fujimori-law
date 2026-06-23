/**
 * 依存ライブラリ不要の最小 XLSX 読み取り（サーバ専用）。
 * 取込（intakeImport）が CSV に加えて Excel(.xlsx) を受け付けるための補助。
 *
 * 方針:
 *   - xlsx は ZIP。Node 標準の zlib(inflateRawSync) だけで展開する。
 *   - ZIP は「セントラルディレクトリ」を辿って各エントリを取り出す（サイズが確実なため）。
 *   - 必要なのは workbook.xml / _rels / sharedStrings.xml / styles.xml / worksheets/*。
 *   - 日付セル（数値＋日付書式）はシリアル値を ISO(yyyy-mm-dd) に変換して返す。
 *     これにより下流の parseDate が全年代の日付を正しく解釈できる。
 *   - 数式・リッチテキスト・インライン文字列・共有文字列に対応。
 *
 * 想定入力は「1ファイル1顧客」の小さな相談票なので性能は問題にならない。
 * 解析不能時は例外を投げ、呼び出し側（preview）でエラー表示する。
 */
import { inflateRawSync } from 'node:zlib'

/** 先頭が ZIP ローカルヘッダ(PK\x03\x04) なら xlsx とみなす */
export function isXlsx(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    buf[2] === 0x03 &&
    buf[3] === 0x04
  )
}

// ── ZIP 展開（セントラルディレクトリ方式） ───────────────────────────
type ZipEntries = Map<string, Buffer>

function readZip(buf: Buffer): ZipEntries {
  const entries: ZipEntries = new Map()
  // End Of Central Directory(0x06054b50) を末尾から探す
  const EOCD = 0x06054b50
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('xlsx: EOCD が見つかりません（壊れたファイル）')
  const cdCount = buf.readUInt16LE(eocd + 10)
  const cdOffset = buf.readUInt32LE(eocd + 16)

  let p = cdOffset
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50)
      throw new Error('xlsx: セントラルディレクトリの破損')
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)

    // ローカルヘッダからデータ開始位置を求める
    if (buf.readUInt32LE(localOff) !== 0x04034b50)
      throw new Error('xlsx: ローカルヘッダの破損')
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)
    const content =
      method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null
    if (content == null)
      throw new Error(`xlsx: 未対応の圧縮方式(${method})`)
    entries.set(name, content)

    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

// ── XML ヘルパ ─────────────────────────────────────────────
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&') // 最後に &amp; を戻す
}

/** <si> 単位で <t> を連結して共有文字列テーブルを作る（リッチテキスト対応） */
function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  const out: string[] = []
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g
  let m: RegExpExecArray | null
  while ((m = siRe.exec(xml))) {
    const inner = m[1] ?? ''
    let text = ''
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g
    let tm: RegExpExecArray | null
    while ((tm = tRe.exec(inner))) text += unescapeXml(tm[1])
    out.push(text)
  }
  return out
}

// ── 日付書式判定 ───────────────────────────────────────────
const BUILTIN_DATE_FMT = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47,
])

/** styles.xml から「セルスタイル index → 日付書式か否か」を作る */
function parseDateStyles(xml: string | undefined): boolean[] {
  if (!xml) return []
  // カスタム書式 numFmtId(>=164) → formatCode
  const customDate = new Map<number, boolean>()
  const nfRe = /<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>]*\/>/g
  let nm: RegExpExecArray | null
  while ((nm = nfRe.exec(xml))) {
    const id = parseInt(nm[1], 10)
    const code = unescapeXml(nm[2])
    // 文字列リテラル・色・ロケール指定を除いて y/m/d/h/s が残れば日付/時刻
    const stripped = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')
    customDate.set(id, /[ymdhs]/i.test(stripped))
  }
  // cellXfs（実セルが参照するスタイル配列）
  const xfsBlock = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)
  if (!xfsBlock) return []
  const isDate: boolean[] = []
  const xfRe = /<xf\b[^>]*?numFmtId="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g
  let xm: RegExpExecArray | null
  while ((xm = xfRe.exec(xfsBlock[1]))) {
    const id = parseInt(xm[1], 10)
    isDate.push(BUILTIN_DATE_FMT.has(id) || customDate.get(id) === true)
  }
  return isDate
}

/** Excel シリアル値(1900系) → ISO(yyyy-mm-dd)。1899-12-30 起点で閏年バグも吸収 */
function serialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

// ── 列参照(A1) → 列インデックス ───────────────────────────
function colToIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '')
  let n = 0
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64)
  }
  return n - 1
}

// ── ワークブック → 対象シート選択 ───────────────────────────
function pickSheetPath(entries: ZipEntries): string {
  const wb = entries.get('xl/workbook.xml')?.toString('utf8') ?? ''
  const rels =
    entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? ''

  // タグ内から属性を順不同で取り出すヘルパ（XML の属性順に依存しない）
  const attr = (tag: string, name: string): string | undefined => {
    const m = tag.match(new RegExp(`(?:^|\\s)(?:\\w+:)?${name}="([^"]*)"`))
    return m ? m[1] : undefined
  }

  // rId → target(worksheets/sheetN.xml)。属性順(Type/Target/Id)は実装依存なので順不同で抽出
  const relMap = new Map<string, string>()
  const relRe = /<Relationship\b[^>]*?\/>/g
  let rm: RegExpExecArray | null
  while ((rm = relRe.exec(rels))) {
    const id = attr(rm[0], 'Id')
    const target = attr(rm[0], 'Target')
    if (id && target) relMap.set(id, target)
  }

  // <sheet name=".." r:id="rId..">（出現順＝タブ順）
  const sheets: { name: string; path: string }[] = []
  const shRe = /<sheet\b[^>]*?\/>/g
  let sm: RegExpExecArray | null
  while ((sm = shRe.exec(wb))) {
    const name = attr(sm[0], 'name') ?? ''
    const rid = attr(sm[0], 'id') // r:id（接頭辞は attr 側で許容）
    const target = rid ? relMap.get(rid) : undefined
    if (!target) continue
    const path = target.startsWith('/')
      ? target.slice(1)
      : 'xl/' + target.replace(/^\.\//, '')
    sheets.push({ name: unescapeXml(name), path })
  }

  if (sheets.length > 0) {
    // 「取込」を含むシートを優先、無ければ先頭タブ
    const hit = sheets.find((s) => s.name.replace(/\s/g, '').includes('取込'))
    return (hit ?? sheets[0]).path
  }
  // フォールバック: 最初に見つかる worksheet
  for (const k of entries.keys()) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(k)) return k
  }
  throw new Error('xlsx: ワークシートが見つかりません')
}

// ── 本体: xlsx Buffer → 行列(string[][]) ───────────────────
export function parseXlsxToRows(buf: Buffer): string[][] {
  const entries = readZip(buf)
  const shared = parseSharedStrings(
    entries.get('xl/sharedStrings.xml')?.toString('utf8')
  )
  const dateStyle = parseDateStyles(
    entries.get('xl/styles.xml')?.toString('utf8')
  )
  const sheetPath = pickSheetPath(entries)
  const sheetXml = entries.get(sheetPath)?.toString('utf8')
  if (!sheetXml) throw new Error('xlsx: シート本体を読めません')

  // セルを総当りで拾い、行・列の絶対位置に配置する（欠損セルも整列）
  const grid: string[][] = []
  let maxCol = 0
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
  let cm: RegExpExecArray | null
  while ((cm = cellRe.exec(sheetXml))) {
    const attrs = cm[1]
    const inner = cm[2] ?? ''
    const refM = attrs.match(/r="([A-Z]+)(\d+)"/)
    if (!refM) continue
    const col = colToIndex(refM[1])
    const rowIdx = parseInt(refM[2], 10) - 1
    const tM = attrs.match(/t="([^"]+)"/)
    const t = tM ? tM[1] : ''
    const sM = attrs.match(/s="(\d+)"/)
    const styleIdx = sM ? parseInt(sM[1], 10) : -1

    let value = ''
    if (t === 's') {
      const vM = inner.match(/<v>([\s\S]*?)<\/v>/)
      const i = vM ? parseInt(vM[1], 10) : -1
      value = i >= 0 && i < shared.length ? shared[i] : ''
    } else if (t === 'inlineStr') {
      const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g
      let im: RegExpExecArray | null
      while ((im = tRe.exec(inner))) value += unescapeXml(im[1])
    } else if (t === 'str') {
      const vM = inner.match(/<v>([\s\S]*?)<\/v>/)
      value = vM ? unescapeXml(vM[1]) : ''
    } else if (t === 'b') {
      const vM = inner.match(/<v>([\s\S]*?)<\/v>/)
      value = vM && vM[1].trim() === '1' ? 'TRUE' : 'FALSE'
    } else {
      // 数値（または日付シリアル）
      const vM = inner.match(/<v>([\s\S]*?)<\/v>/)
      const raw = vM ? vM[1].trim() : ''
      if (raw !== '' && styleIdx >= 0 && dateStyle[styleIdx] && /^\d+(\.\d+)?$/.test(raw)) {
        value = serialToIso(parseFloat(raw))
      } else {
        value = raw
      }
    }

    if (!grid[rowIdx]) grid[rowIdx] = []
    grid[rowIdx][col] = value
    if (col > maxCol) maxCol = col
  }

  // 穴埋め（undefined → ''）して矩形化
  const rows: string[][] = []
  for (let r = 0; r < grid.length; r++) {
    const src = grid[r] ?? []
    const line: string[] = []
    for (let c = 0; c <= maxCol; c++) line.push(src[c] ?? '')
    rows.push(line)
  }
  return rows
}
