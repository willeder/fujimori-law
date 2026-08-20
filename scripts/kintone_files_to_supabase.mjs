/**
 * kintone の添付ファイル（34,477件・26.3GB）を Supabase Storage へ移す。
 *
 * なぜ Storage か:
 *   既存の creditor_files は Bytes 列に実体を入れている。案件添付は 26.3GB あるため
 *   同じやり方だと Postgres の容量・バックアップ・取得速度のどれも成り立たない。
 *   実体は Storage（バケット case-files）、DBは置き場所（case_files 表）だけ持つ。
 *
 * 使い方（リポジトリのルートで実行）:
 *   .env に次を入れておけば、そのまま実行できる。
 *     KINTONE_SUBDOMAIN / KINTONE_TOKEN / SUPABASE_URL / SUPABASE_SECRET_KEY / DATABASE_URL
 *
 *   node scripts/kintone_files_to_supabase.mjs [--limit 50] [--dry-run] [--field 相談票添付]
 *
 *   --limit N   … 先頭N件だけ処理（まず 50 件で試すこと）
 *   --dry-run   … ダウンロードもアップロードもせず、対象件数と宛先パスだけ出す
 *   --field X   … そのフィールドだけ（相談票添付 / 和解ファイル）
 *   --retry     … 前回 failed に落ちたものだけ再試行
 *   --concurrency N … 同時に処理する本数（既定 4）。1件ずつだと34,477件が終わらない。
 *                     kintone は同一サブドメインへの同時実行数に上限があるため上げすぎない。
 *
 * 途中で止めても安全:
 *   1件アップロードするたびに case_files へ行を作る。kintoneFileKey が unique なので、
 *   再実行すると済んだ分は自動で飛ばす。26GB は一度で終わらない前提の作り。
 *
 * 進捗ログ: docs/data/kintone/upload_state.ndjson（1行1件・成功/失敗）
 *
 * ★ 鍵は環境変数で渡すこと。.env や git に書かない。
 * ★ SUPABASE_SECRET_KEY は本番DBの全権鍵。実行後は履歴に残さないこと。
 */
// openAsBlob は node:fs 側にある（node:fs/promises には無い）。Promise を返す。
import { createWriteStream, openAsBlob } from 'node:fs'
import { appendFile, readFile, mkdir, stat, unlink } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

// .env を読む。export を毎回打たなくて済むようにするため。
// 既に環境変数で渡されていればそちらが勝つ（loadEnvFile は既存の値を上書きしない）。
try {
  process.loadEnvFile('.env')
} catch {
  /* .env が無くても、環境変数で渡されていれば動く */
}

const SUB = process.env.KINTONE_SUBDOMAIN
const TOKEN = process.env.KINTONE_TOKEN
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = process.env.SUPABASE_BUCKET ?? 'case-files'

if (!SUB || !TOKEN || !SUPABASE_URL || !SECRET) {
  console.error(
    'KINTONE_SUBDOMAIN / KINTONE_TOKEN / SUPABASE_URL / SUPABASE_SECRET_KEY を環境変数で指定してください',
  )
  process.exit(1)
}

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n, d = null) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const LIMIT = Number(opt('--limit', '0')) || 0
const DRY = flag('--dry-run')
const ONLY_FIELD = opt('--field', null)
const RETRY_ONLY = flag('--retry')
const CONCURRENCY = Math.max(1, Math.min(8, Number(opt('--concurrency', '4')) || 4))

const DATA_DIR = 'docs/data/kintone'
const INVENTORY = path.join(DATA_DIR, 'files_inventory.ndjson')
const RECORDS = path.join(DATA_DIR, 'records.ndjson')
const STATE = path.join(DATA_DIR, 'upload_state.ndjson')
const TMP_DIR = path.join(DATA_DIR, '.tmp')

const prisma = new PrismaClient()

/** 拡張子から Content-Type を推定（kintone は MIME を返さないため） */
const MIME = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.webp': 'image/webp',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
}
const mimeOf = (name) => MIME[path.extname(name).toLowerCase()] ?? 'application/octet-stream'

/**
 * Storage のキーに使える形に落とす。
 *
 * Supabase Storage は非ASCIIのキーを `InvalidKey` で弾く。
 * kintone の ID には「101213①」「44800Ｗ」のように丸数字・全角英字が混ざっており、
 * そのまま使うと 466 件が落ちた（実際に落ちた）。
 *   丸数字 ①〜⑳  → _1 〜 _20（NFKC だと「101213①」が「1012131」になり読めなくなる）
 *   全角英数 Ｗ   → W（NFKC）
 *   それ以外の非ASCII → _
 * ディレクトリ名が重なっても、キー末尾の fileKey が一意なので衝突はしない。
 */
function safeSegment(v) {
  let t = String(v ?? '').trim()
  t = t.replace(/[\u2460-\u2473]/g, (c) => '_' + (c.charCodeAt(0) - 0x2460 + 1))
  t = t.normalize('NFKC')
  t = t.replace(/[^A-Za-z0-9._-]/g, '_')
  return t || 'unknown'
}

/**
 * Storage のキーは ASCII 安全な形にする。
 * 日本語ファイル名のままだと署名URLやCLIでの取り回しで事故りやすいので、
 * 実体のキーは fileKey + 拡張子、表示名は case_files.name に持つ、と役割を分ける。
 */
function storageKey(externalId, field, fileKey, name) {
  const fieldSlug = field === '相談票添付' ? 'intake' : field === '和解ファイル' ? 'settlement' : 'other'
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '')
  return `cases/${safeSegment(externalId)}/${fieldSlug}/${safeSegment(fileKey)}${ext}`
}

async function readNdjson(file) {
  const text = await readFile(file, 'utf8')
  const out = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t) out.push(JSON.parse(t))
  }
  return out
}

/**
 * kintone recordId → { レコード番号, ID } の対応表を records.ndjson から作る。
 *
 * 突合は **レコード番号** を第一キーにする。ID（118823E 等）は事務所側で
 * 直されることがあり当てにならない（例: DB「152161Ew」→ kintone「152161E」、
 * 先頭に空白の「 116387E」、末尾に余分な e の「110875Ee」）。
 */
async function loadRecordIdMap() {
  const text = await readFile(RECORDS, 'utf8')
  const map = new Map()
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const r = JSON.parse(t)
    const rid = r['$id']?.value
    if (!rid) continue
    map.set(String(rid), {
      recordNumber: Number(r['レコード番号']?.value),
      externalId: String(r['ID']?.value ?? '').trim(),
    })
  }
  return map
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 一時的な失敗（502/503/504・接続断）だけを数回まで再試行する。
 * 34,477件を流すあいだに必ず何度か起きるので、都度手で拾い直すのは現実的でない。
 * 400/403 のような「直さないと通らない」失敗は再試行しても無駄なので即あきらめる。
 */
function isTransient(e) {
  const m = String(e)
  return (
    /HTTP 5\d\d/.test(m) ||
    /fetch failed/i.test(m) ||
    /ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|socket hang up|terminated/i.test(m)
  )
}

async function withRetry(label, fn, attempts = 4) {
  let last
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (!isTransient(e) || i === attempts) throw e
      const wait = 1000 * 2 ** (i - 1) // 1秒 → 2秒 → 4秒
      console.error(`  再試行 ${i}/${attempts - 1}（${wait / 1000}秒待機）${label}: ${e}`)
      await sleep(wait)
    }
  }
  throw last
}

/** kintone からファイルを一時ファイルへ落とす（メモリに載せない：最大678MBの添付がある） */
async function downloadToTmp(fileKey) {
  const url = `https://${SUB}.cybozu.com/k/v1/file.json?fileKey=${encodeURIComponent(fileKey)}`
  const r = await fetch(url, { headers: { 'X-Cybozu-API-Token': TOKEN } })
  if (!r.ok || !r.body) throw new Error(`kintone download HTTP ${r.status}`)
  const tmp = path.join(TMP_DIR, `${fileKey}.bin`)
  await pipeline(Readable.fromWeb(r.body), createWriteStream(tmp))
  return tmp
}

/**
 * Supabase への認証ヘッダー。
 *
 * 新しいキー（sb_secret_... / sb_publishable_...）は **JWT ではない**ため、
 * Authorization: Bearer で送るとプラットフォーム側がJWTとして解析しようとして
 * `Invalid Compact JWS` で弾かれる。公式ドキュメントの明記どおり apikey で送る。
 *   https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
 * 旧 service_role キー（JWT）を使う場合だけ Authorization も併せて付ける。
 */
function supabaseAuthHeaders() {
  const h = { apikey: SECRET }
  if (SECRET.startsWith('eyJ')) h.Authorization = `Bearer ${SECRET}`
  return h
}

/**
 * Supabase Storage へアップロード（upsert）。
 *
 * openAsBlob を使う理由:
 *   ファイルを丸ごとメモリに載せずに送れて、かつ Content-Length が自動で付く。
 *   ReadableStream + duplex:'half' + 手動 Content-Length は undici 側で
 *   弾かれることがあり、678MB の添付で落ちると復旧が面倒なため避ける。
 *
 * 標準アップロードの上限は 5GB（Supabase仕様）。最大の添付が 678MB なので範囲内。
 * ただし Supabase の「Global file size limit」が別にあり、そちらが優先される。
 * 50MB を超える添付は7件だけなので、そこで落ちたら --retry で拾い直せる。
 */
async function uploadFromTmp(tmpPath, key, mime) {
  const { size } = await stat(tmpPath)
  const blob = await openAsBlob(tmpPath, { type: mime })
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: {
      ...supabaseAuthHeaders(),
      'x-upsert': 'true',
      'cache-control': '3600',
    },
    body: blob,
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`storage upload HTTP ${r.status} ${body.slice(0, 200)}`)
  }
  return size
}

async function main() {
  await mkdir(TMP_DIR, { recursive: true })

  const inv = await readNdjson(INVENTORY)
  const recMap = await loadRecordIdMap()

  // 既に取り込み済みの fileKey（再実行しても二重に上げない）
  const done = new Set(
    (await prisma.caseFile.findMany({ select: { kintoneFileKey: true } }))
      .map((r) => r.kintoneFileKey)
      .filter(Boolean),
  )

  // 案件の対応表。第一キー=レコード番号、第二キー=前後の空白を落としたID
  const cases = await prisma.case.findMany({
    select: { id: true, externalId: true, recordNumber: true },
  })
  const caseByRecordNumber = new Map(
    cases.filter((c) => c.recordNumber != null).map((c) => [c.recordNumber, c.id]),
  )
  const caseByExt = new Map(
    cases.filter((c) => c.externalId).map((c) => [c.externalId.trim(), c.id]),
  )

  let failedKeys = null
  if (RETRY_ONLY) {
    failedKeys = new Set()
    try {
      for (const row of await readNdjson(STATE)) if (row.ok === false) failedKeys.add(row.fileKey)
    } catch {
      /* state が無ければ全件対象のまま */
    }
  }

  const targets = []
  const skipped = { done: 0, noCase: 0, otherField: 0, notFailed: 0 }
  const noCaseIds = new Set()
  for (const f of inv) {
    if (ONLY_FIELD && f.field !== ONLY_FIELD) {
      skipped.otherField++
      continue
    }
    if (done.has(f.fileKey)) {
      skipped.done++
      continue
    }
    if (failedKeys && !failedKeys.has(f.fileKey)) {
      skipped.notFailed++
      continue
    }
    const rec = recMap.get(String(f.recordId))
    const caseId = rec
      ? (Number.isFinite(rec.recordNumber) ? caseByRecordNumber.get(rec.recordNumber) : undefined) ??
        caseByExt.get(rec.externalId)
      : undefined
    if (!caseId) {
      skipped.noCase++
      noCaseIds.add(`${f.recordId} / ${rec?.externalId ?? '(不明)'}`)
      continue
    }
    // Storage のパスは案件IDではなく kintone の ID を使う（人が見て分かるように）
    targets.push({ ...f, externalId: rec.externalId || String(f.recordId), caseId })
  }

  const list = LIMIT > 0 ? targets.slice(0, LIMIT) : targets
  const totalBytes = list.reduce((s, f) => s + Number(f.size || 0), 0)
  console.log(
    `対象 ${list.length} 件 / ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB` +
      `（済 ${skipped.done} / 案件なし ${skipped.noCase}` +
      (ONLY_FIELD ? ` / 対象外フィールド ${skipped.otherField}` : '') +
      (RETRY_ONLY ? ` / 失敗以外 ${skipped.notFailed}` : '') +
      `）`,
  )

  if (skipped.noCase > 0) {
    // 黙って落とすと添付が消えたことに気づけないので、必ず中身を出す
    console.log(`  ▼ システムに該当案件が無いため対象外にしたレコード（${noCaseIds.size}件）:`)
    for (const x of [...noCaseIds].slice(0, 30)) console.log(`    レコード番号 ${x}`)
    if (noCaseIds.size > 30) console.log(`    … 他 ${noCaseIds.size - 30} 件`)
  }

  if (DRY) {
    for (const f of list.slice(0, 20)) {
      console.log(' ', storageKey(f.externalId, f.field, f.fileKey, f.name), '<-', f.name)
    }
    if (list.length > 20) console.log(`  … 他 ${list.length - 20} 件`)
    await prisma.$disconnect()
    return
  }

  let ok = 0
  let ng = 0
  let bytes = 0
  let processed = 0
  const started = Date.now()

  /** 1件ぶんの処理。落ちても他を止めない */
  async function handle(f) {
    const key = storageKey(f.externalId, f.field, f.fileKey, f.name)
    let tmp = null
    try {
      tmp = await withRetry(f.name, () => downloadToTmp(f.fileKey))
      const size = await withRetry(f.name, () => uploadFromTmp(tmp, key, mimeOf(f.name)))
      await prisma.caseFile.create({
        data: {
          caseId: f.caseId,
          field: f.field,
          name: f.name,
          mime: mimeOf(f.name),
          size,
          storagePath: key,
          kintoneFileKey: f.fileKey,
          uploadedBy: 'kintone-migration',
        },
      })
      ok++
      bytes += size
      await appendFile(STATE, JSON.stringify({ ok: true, fileKey: f.fileKey, key, size }) + '\n')
    } catch (e) {
      ng++
      await appendFile(
        STATE,
        JSON.stringify({ ok: false, fileKey: f.fileKey, key, error: String(e).slice(0, 300) }) + '\n',
      )
      console.error(`  NG ${f.name}: ${e}`)
    } finally {
      if (tmp) await unlink(tmp).catch(() => {})
    }

    processed++
    if (processed % 25 === 0 || processed === list.length) {
      const min = (Date.now() - started) / 60000
      const mbps = bytes / 1024 / 1024 / Math.max(min * 60, 1)
      const remain = list.length - processed
      const eta = processed > 0 ? remain * (min / processed) : 0
      console.log(
        `${processed}/${list.length}  成功${ok} 失敗${ng}  ` +
          `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB  ` +
          `${min.toFixed(1)}分（${mbps.toFixed(1)}MB/秒）  残り約${eta.toFixed(0)}分`,
      )
    }
  }

  // ワーカープール。1件ずつ順番だと34,477件が現実的な時間で終わらない
  let cursor = 0
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const idx = cursor++
      if (idx >= list.length) return
      await handle(list[idx])
    }
  })
  await Promise.all(workers)

  console.log(`完了: 成功 ${ok} / 失敗 ${ng}`)
  if (ng > 0) console.log('失敗分は  node scripts/kintone_files_to_supabase.mjs --retry  で再試行できます')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
