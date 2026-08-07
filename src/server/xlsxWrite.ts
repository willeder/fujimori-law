/**
 * 依存ライブラリ不要の最小 XLSX 書き出し（サーバ専用）。
 * 読み取り側の xlsxLite.ts と対になるもので、こちらは「集計表を1シート書く」だけを担う。
 *
 * 方針:
 *   - xlsx は ZIP。Node 標準の zlib(deflateRawSync) で各パーツを圧縮して詰める。
 *   - 文字列は共有文字列テーブルを使わず inlineStr で書く（実装を単純に保つため）。
 *   - 数値は素の <v>、書式は styles.xml の最小セット（見出し太字 / 3桁区切り / 小数1桁）。
 * 想定用途は数十行×数百列の集計表なので、この単純な実装で十分に速い。
 */
import { deflateRawSync } from 'node:zlib'

/** セルの中身。string=文字列 / number=数値 / null=空欄 */
export type XlsxCell = string | number | null

/** セルの書式（styles.xml の cellXfs インデックスに対応） */
export const STYLE = {
  /** 既定（書式なし） */
  plain: 0,
  /** 見出し（太字＋薄いグレー背景） */
  header: 1,
  /** 金額（#,##0） */
  money: 2,
  /** 小数1桁（0.0）— 社数換算のような割り切れない値に使う */
  decimal: 3,
} as const

export type XlsxRow = { cells: XlsxCell[]; styles?: number[] }

// ── ZIP（deflate 圧縮で格納） ────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function zip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8')
    const comp = deflateRawSync(f.data)
    const crc = crc32(f.data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4) // version needed
    lh.writeUInt16LE(0, 6) // flags
    lh.writeUInt16LE(8, 8) // method 8 = deflate
    lh.writeUInt16LE(0, 10) // time
    lh.writeUInt16LE(0, 12) // date
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(comp.length, 18)
    lh.writeUInt32LE(f.data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)
    parts.push(lh, nameBuf, comp)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0, 8)
    ch.writeUInt16LE(8, 10)
    ch.writeUInt16LE(0, 12)
    ch.writeUInt16LE(0, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(comp.length, 20)
    ch.writeUInt32LE(f.data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30)
    ch.writeUInt16LE(0, 32)
    ch.writeUInt16LE(0, 34)
    ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38)
    ch.writeUInt32LE(offset, 42)
    central.push(Buffer.concat([ch, nameBuf]))
    offset += lh.length + nameBuf.length + comp.length
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

// ── XML 組み立て ──────────────────────────────────────────────
/** XML エスケープ。xlsx が受け付けない制御文字は落とす。 */
const esc = (s: string): string =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** 0 始まりの列番号 → A, B, ... Z, AA, AB, ... */
export function colName(i: number): string {
  let n = i + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function cellXml(ref: string, v: XlsxCell, style: number): string {
  const s = style ? ` s="${style}"` : ''
  if (v == null || v === '') return ''
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return ''
    return `<c r="${ref}"${s}><v>${v}</v></c>`
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF3F8"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

/**
 * 1シートの xlsx を組み立てて Buffer で返す。
 * @param sheetName シート名（31文字以内）
 * @param rows 上から順の行データ
 * @param opts.freezeAt 例 'D4' … そのセルの左上でウィンドウ枠を固定する
 * @param opts.colWidths 列幅（先頭から）。指定が無い列は既定幅
 */
export function buildXlsx(
  sheetName: string,
  rows: XlsxRow[],
  opts: { freezeAt?: string; colWidths?: number[] } = {}
): Buffer {
  const body = rows
    .map((row, ri) => {
      const r = ri + 1
      const cells = row.cells
        .map((v, ci) => cellXml(`${colName(ci)}${r}`, v, row.styles?.[ci] ?? 0))
        .join('')
      return `<row r="${r}">${cells}</row>`
    })
    .join('')

  let panes = '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
  const m = opts.freezeAt ? opts.freezeAt.match(/^([A-Z]+)(\d+)$/) : null
  if (m) {
    const xSplit = m[1].split('').reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1
    const ySplit = Number(m[2]) - 1
    panes =
      '<sheetViews><sheetView workbookViewId="0">' +
      `<pane xSplit="${xSplit}" ySplit="${ySplit}" topLeftCell="${opts.freezeAt}" activePane="bottomRight" state="frozen"/>` +
      '</sheetView></sheetViews>'
  }
  const cols = opts.colWidths?.length
    ? '<cols>' +
      opts.colWidths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('') +
      '</cols>'
    : ''

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${panes}${cols}<sheetData>${body}</sheetData></worksheet>`

  const files: { name: string; data: Buffer }[] = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${esc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    },
    { name: 'xl/styles.xml', data: Buffer.from(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
  ]
  return zip(files)
}
