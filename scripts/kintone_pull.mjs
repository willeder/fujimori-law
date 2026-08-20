/**
 * kintone から移行対象を API で一括取得する。
 *
 * CSV エクスポートでは取れないもの（添付ファイル・コメント・ビュー定義）と、
 * CSV より正確に取れるもの（レコード本体）をまとめて落とす。
 *
 * 使い方（このリポジトリのルートで実行）:
 *   KINTONE_SUBDOMAIN=growwell KINTONE_APP=4 KINTONE_TOKEN=xxxxx \
 *     node scripts/kintone_pull.mjs [--files] [--comments]
 *
 *   --files    … 添付ファイルも落とす（受任資料の写真・和解提案書のWordなど）
 *   --comments … レコードコメントも落とす（レコード数ぶんAPIを叩くので時間がかかる）
 *
 * 出力先: docs/data/kintone/
 *   app_fields.json     フォーム定義（選択肢・並び順）
 *   app_views.json      ビュー定義（kintone の一覧＝保存した絞り込みの正）
 *   app_settings.json   アプリ一般設定
 *   records.ndjson      全レコード（1行1件・サブテーブル込み）
 *   comments/<id>.json  レコードコメント（--comments 時）
 *   files/<recordId>/<フィールド>/<ファイル名>  添付ファイル（--files 時）
 *   _summary.json       取得結果のサマリ
 *
 * ★ APIトークンは「閲覧」権限のみで足ります。ファイル取得にも閲覧で足ります。
 * ★ .env や git にトークンを書かないこと（実行時の環境変数で渡す）。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'

const SUB = process.env.KINTONE_SUBDOMAIN
const APP = process.env.KINTONE_APP
const TOKEN = process.env.KINTONE_TOKEN
if (!SUB || !APP || !TOKEN) {
  console.error('KINTONE_SUBDOMAIN / KINTONE_APP / KINTONE_TOKEN を環境変数で指定してください')
  process.exit(1)
}
const WANT_FILES = process.argv.includes('--files')
const WANT_COMMENTS = process.argv.includes('--comments')

const BASE = `https://${SUB}.cybozu.com/k/v1`
const OUT = path.resolve('docs/data/kintone')
const H = { 'X-Cybozu-API-Token': TOKEN }

async function api(pathname, params = {}) {
  const url = new URL(BASE + pathname)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const r = await fetch(url, { headers: H })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`${pathname} → HTTP ${r.status} ${body.slice(0, 300)}`)
  }
  return r.json()
}

const save = async (name, data) =>
  writeFile(path.join(OUT, name), JSON.stringify(data, null, 2), 'utf8')

/**
 * 大きい配列は1行1件（NDJSON）で書く。
 * サブテーブル込みの全レコードを JSON.stringify で1本の文字列にすると
 * Node の文字列長上限を超えて "Invalid string length" で落ちるため。
 */
async function saveNdjson(name, rows) {
  const ws = createWriteStream(path.join(OUT, name), { encoding: 'utf8' })
  for (const r of rows) {
    if (!ws.write(JSON.stringify(r) + '\n')) {
      await new Promise((res) => ws.once('drain', res))
    }
  }
  await new Promise((res, rej) => {
    ws.end(() => res())
    ws.on('error', rej)
  })
}

/** レコードは cursor API で全件取る（10,000件超でも取り切れる） */
async function fetchAllRecords() {
  const c = await fetch(`${BASE}/records/cursor.json`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ app: APP, size: 500 }),
  }).then((r) => r.json())
  if (!c.id) throw new Error('cursor 作成に失敗: ' + JSON.stringify(c).slice(0, 300))
  const all = []
  for (;;) {
    const page = await api('/records/cursor.json', { id: c.id })
    all.push(...page.records)
    process.stdout.write(`\r  レコード取得 ${all.length} / ${c.totalCount}`)
    if (!page.next) break
  }
  process.stdout.write('\n')
  return all
}

/** 添付ファイルのフィールドを再帰的に集める（サブテーブル内も対象） */
function collectFiles(record) {
  const out = []
  const walk = (obj, tablePath = '') => {
    for (const [field, cell] of Object.entries(obj)) {
      if (!cell || typeof cell !== 'object') continue
      if (cell.type === 'SUBTABLE' && Array.isArray(cell.value)) {
        cell.value.forEach((row, i) => walk(row.value, `${field}[${i}]/`))
      } else if (cell.type === 'FILE' && Array.isArray(cell.value)) {
        for (const f of cell.value) {
          out.push({ field: tablePath + field, name: f.name, fileKey: f.fileKey, size: f.size })
        }
      }
    }
  }
  walk(record)
  return out
}

async function downloadFile(fileKey, dest) {
  const r = await fetch(`${BASE}/file.json?fileKey=${encodeURIComponent(fileKey)}`, { headers: H })
  if (!r.ok) throw new Error(`file ${fileKey} → HTTP ${r.status}`)
  await mkdir(path.dirname(dest), { recursive: true })
  await pipeline(Readable.fromWeb(r.body), createWriteStream(dest))
}

const main = async () => {
  await mkdir(OUT, { recursive: true })
  const summary = { subdomain: SUB, app: APP, at: new Date().toISOString() }

  console.log('■ フォーム定義')
  const fields = await api('/app/form/fields.json', { app: APP })
  await save('app_fields.json', fields)
  summary.fields = Object.keys(fields.properties).length

  console.log('■ ビュー定義（kintone の一覧）')
  const views = await api('/app/views.json', { app: APP })
  await save('app_views.json', views)
  summary.views = Object.keys(views.views ?? {}).length

  console.log('■ アプリ設定')
  try {
    await save('app_settings.json', await api('/app/settings.json', { app: APP }))
  } catch (e) {
    console.warn('  設定の取得をスキップ:', e.message)
  }

  console.log('■ レコード')
  const records = await fetchAllRecords()
  await saveNdjson('records.ndjson', records)
  summary.records = records.length
  console.log(`  records.ndjson に ${records.length} 件を書き出しました`)

  // 添付ファイルの棚卸し（--files を付けなくても件数・容量は必ず出す）
  const inventory = []
  for (const rec of records) {
    const id = rec.$id?.value ?? rec.レコード番号?.value
    for (const f of collectFiles(rec)) inventory.push({ recordId: id, ...f })
  }
  await saveNdjson('files_inventory.ndjson', inventory)
  summary.files = inventory.length
  summary.filesBytes = inventory.reduce((s, f) => s + Number(f.size || 0), 0)
  console.log(
    `  添付ファイル ${inventory.length} 件 / ${(summary.filesBytes / 1024 / 1024).toFixed(1)} MB`
  )

  if (WANT_FILES && inventory.length) {
    console.log('■ 添付ファイルのダウンロード')
    let n = 0
    for (const f of inventory) {
      const safe = f.name.replace(/[/\\]/g, '_')
      const dest = path.join(OUT, 'files', String(f.recordId), f.field.replace(/[/\\]/g, '_'), safe)
      try {
        await downloadFile(f.fileKey, dest)
      } catch (e) {
        console.warn(`  失敗 ${f.recordId}/${f.name}: ${e.message}`)
      }
      n += 1
      if (n % 20 === 0) process.stdout.write(`\r  ${n} / ${inventory.length}`)
    }
    process.stdout.write('\n')
  }

  if (WANT_COMMENTS) {
    console.log('■ レコードコメント')
    await mkdir(path.join(OUT, 'comments'), { recursive: true })
    let n = 0
    let total = 0
    for (const rec of records) {
      const id = rec.$id.value
      try {
        const c = await api('/record/comments.json', { app: APP, record: id, order: 'asc', limit: 10 })
        if (c.comments?.length) {
          await save(path.join('comments', `${id}.json`), c.comments)
          total += c.comments.length
        }
      } catch (e) {
        console.warn(`  失敗 record ${id}: ${e.message}`)
      }
      n += 1
      if (n % 50 === 0) process.stdout.write(`\r  ${n} / ${records.length}（コメント ${total}件）`)
    }
    process.stdout.write('\n')
    summary.comments = total
  }

  await save('_summary.json', summary)
  console.log('\n完了:', JSON.stringify(summary, null, 2))
  console.log('出力先:', OUT)
}

main().catch((e) => {
  console.error('エラー:', e.message)
  process.exit(1)
})
