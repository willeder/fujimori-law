/**
 * 案件の添付ファイル（kintone の「相談票添付」「和解ファイル」）。
 *
 * 債権者資料（creditorFiles.ts）は実体を DB の bytea に入れているが、
 * 案件添付は kintone に 34,477件・26.3GB あるため同じやり方は取れない。
 * 実体は Supabase Storage（バケット case-files・非公開）に置き、
 * DB（case_files）は「どこに何があるか」だけを持つ。
 *
 * 画面へは実体を通さず **署名付きURL** を返す。
 *   - 期限付き（既定10分）なので、URLが流出しても期限後は開けない
 *   - 26GBのファイルがアプリのサーバを経由しないので Vercel の実行時間・
 *     ボディ上限（4.5MB）に引っかからない
 *
 * 必要な環境変数（Vercel と .env の両方）:
 *   SUPABASE_URL         例) https://sbvuiqoviquvejwydrbl.supabase.co
 *   SUPABASE_SECRET_KEY  sb_secret_... （サーバ専用。ブラウザに出さないこと）
 */
import { prisma } from './db.js'
import { writeAudit, type Actor } from './audit.js'

const SUPABASE_URL = () => (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const SECRET = () => process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const BUCKET = () => process.env.SUPABASE_BUCKET ?? 'case-files'

/** 署名付きURLの有効期限（秒）。開いて読む用途なので短くてよい */
const SIGN_EXPIRES_SEC = 600

/**
 * Supabase への認証ヘッダー。
 *
 * 新しいキー（sb_secret_...）は **JWT ではない**ため、Authorization: Bearer で
 * 送るとプラットフォームがJWTとして解析しようとして `Invalid Compact JWS` になる。
 * 公式ドキュメントの指定どおり apikey ヘッダーで送る。
 *   https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
 * 旧 service_role キー（JWT形式）のときだけ Authorization も併せて付ける。
 */
function authHeaders(): Record<string, string> {
  const key = SECRET()
  const h: Record<string, string> = { apikey: key }
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`
  return h
}

export function storageConfigured(): boolean {
  return SUPABASE_URL() !== '' && SECRET() !== ''
}

export type CaseFileMeta = {
  id: number
  caseId: number
  field: string
  /** 受任資料の区分。kintone由来の分は null */
  category: string | null
  name: string
  mime: string
  size: number
  uploadedBy: string
  createdAt: string
}

export async function listCaseFiles(caseId: number): Promise<CaseFileMeta[]> {
  const rows = await prisma.caseFile.findMany({
    where: { caseId },
    orderBy: [{ field: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      caseId: true,
      field: true,
      category: true,
      name: true,
      mime: true,
      size: true,
      uploadedBy: true,
      createdAt: true,
    },
  })
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
}

/**
 * 1件の署名付きURLを作る。
 * download=true なら「保存」ダイアログ、false ならブラウザ内表示（画像・PDF）。
 */
export async function signCaseFile(
  actor: Actor,
  fileId: number,
  download = false,
): Promise<{ status: number; body: unknown }> {
  if (!storageConfigured())
    return { status: 503, body: { error: 'SUPABASE_URL / SUPABASE_SECRET_KEY が未設定です' } }

  const row = await prisma.caseFile.findUnique({
    where: { id: fileId },
    select: { id: true, caseId: true, name: true, mime: true, storagePath: true },
  })
  if (!row) return { status: 404, body: { error: 'not found' } }

  const r = await fetch(
    `${SUPABASE_URL()}/storage/v1/object/sign/${BUCKET()}/${row.storagePath}`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: SIGN_EXPIRES_SEC }),
    },
  )
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    return { status: 502, body: { error: `署名URLの発行に失敗しました (${r.status}) ${detail.slice(0, 200)}` } }
  }
  const data = (await r.json()) as { signedURL?: string; signedUrl?: string }
  const rel = data.signedURL ?? data.signedUrl
  if (!rel) return { status: 502, body: { error: '署名URLが応答に含まれていません' } }

  // 応答は "/object/sign/..." の相対パス。ダウンロード指定はクエリで付ける
  const url =
    `${SUPABASE_URL()}/storage/v1${rel.startsWith('/') ? rel : `/${rel}`}` +
    (download ? `&download=${encodeURIComponent(row.name)}` : '')

  // 誰がどの依頼者の資料を開いたかは残す（個人情報のため）
  await writeAudit({
    actor,
    action: 'VIEW',
    entity: 'CaseFile',
    entityId: String(row.id),
    summary: `案件添付を閲覧: ${row.name}`,
    metadata: { caseId: row.caseId, download },
  })

  return { status: 200, body: { ok: true, url, name: row.name, mime: row.mime, expiresIn: SIGN_EXPIRES_SEC } }
}

// ── 画面からのアップロード（受任資料）─────────────────────────────
//
// ブラウザ → アプリのサーバ → Storage と中継すると、Vercel のリクエスト本文の
// 上限（4.5MB）に引っかかる。マイナンバーカードの写真は数MBになるため実用に耐えない。
// そこで「サーバは署名付きのアップロードURLを出すだけ」にして、実体はブラウザから
// Storage へ直接送る。送り終わったらサーバに知らせて case_files へ記録する。

/** 画面から入れた資料の field 値。kintone由来（相談票添付・和解ファイル）と区別する */
export const UPLOAD_FIELD = '受任資料'

/** 受任資料の区分。マイナンバーカードの表裏ではなく「身分証明書」1つにまとめる */
export const UPLOAD_CATEGORIES = [
  '身分証明書',
  '委任状',
  '和解書',
  '債権調査票',
  '受任通知書',
  'その他書類',
] as const

/** 1ファイルの上限。写真・PDFを想定 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

/** Storage のキーに使える形に落とす（非ASCIIは Storage が InvalidKey で弾く） */
function safeSegment(v: string): string {
  let t = String(v ?? '').trim()
  t = t.replace(/[\u2460-\u2473]/g, (c) => '_' + (c.charCodeAt(0) - 0x2460 + 1))
  t = t.normalize('NFKC')
  t = t.replace(/[^A-Za-z0-9._-]/g, '_')
  return t || 'unknown'
}

/**
 * アップロード用の署名付きURLを発行する。
 * 実体の送信はブラウザが直接 Storage に対して行う。
 */
export async function createUploadUrl(
  caseId: number,
  raw: string,
): Promise<{ status: number; body: unknown }> {
  if (!storageConfigured())
    return { status: 503, body: { error: 'SUPABASE_URL / SUPABASE_SECRET_KEY が未設定です' } }

  let input: { name?: string; mime?: string; size?: number; category?: string }
  try {
    input = JSON.parse(raw || '{}') as typeof input
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  const name = (input.name ?? '').trim().slice(0, 255)
  if (!name) return { status: 400, body: { error: 'ファイル名が空です' } }
  const size = Number(input.size ?? 0)
  if (!Number.isFinite(size) || size <= 0)
    return { status: 400, body: { error: 'ファイルが空です' } }
  if (size > MAX_UPLOAD_BYTES)
    return {
      status: 413,
      body: { error: `ファイルが大きすぎます（上限 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB）` },
    }

  const target = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, externalId: true },
  })
  if (!target) return { status: 404, body: { error: 'case not found' } }

  // 同じ名前を入れ直しても上書きにならないよう、時刻を混ぜて一意にする
  const ext = (name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '').toLowerCase()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const storagePath =
    `cases/${safeSegment(target.externalId ?? String(target.id))}/upload/${stamp}${ext}`

  const r = await fetch(
    `${SUPABASE_URL()}/storage/v1/object/upload/sign/${BUCKET()}/${storagePath}`,
    { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: '{}' },
  )
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    return {
      status: 502,
      body: { error: `アップロードURLの発行に失敗しました (${r.status}) ${detail.slice(0, 200)}` },
    }
  }
  const data = (await r.json()) as { url?: string; token?: string }
  const rel = data.url
  if (!rel) return { status: 502, body: { error: 'アップロードURLが応答に含まれていません' } }

  return {
    status: 200,
    body: {
      ok: true,
      uploadUrl: `${SUPABASE_URL()}/storage/v1${rel.startsWith('/') ? rel : `/${rel}`}`,
      storagePath,
    },
  }
}

/**
 * ブラウザからStorageへの送信が終わったあとに呼ばれ、case_files へ記録する。
 * 実体が本当に置かれているかを Storage 側に問い合わせて確かめてから記録する
 * （確かめないと、失敗したアップロードが一覧に残って「開けないファイル」になる）。
 */
export async function recordUploadedFile(
  actor: Actor,
  caseId: number,
  raw: string,
): Promise<{ status: number; body: unknown }> {
  if (!storageConfigured())
    return { status: 503, body: { error: 'SUPABASE_URL / SUPABASE_SECRET_KEY が未設定です' } }

  let input: { name?: string; mime?: string; category?: string; storagePath?: string }
  try {
    input = JSON.parse(raw || '{}') as typeof input
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  const storagePath = (input.storagePath ?? '').trim()
  const name = (input.name ?? '').trim().slice(0, 255)
  if (!storagePath || !name) return { status: 400, body: { error: 'bad request' } }
  if (!storagePath.startsWith('cases/')) return { status: 400, body: { error: 'bad path' } }

  const category = UPLOAD_CATEGORIES.includes(
    (input.category ?? '') as (typeof UPLOAD_CATEGORIES)[number],
  )
    ? (input.category as string)
    : 'その他書類'

  // 実体の確認（HEAD相当。存在しなければ記録しない）
  const head = await fetch(`${SUPABASE_URL()}/storage/v1/object/info/${BUCKET()}/${storagePath}`, {
    headers: authHeaders(),
  })
  if (!head.ok) return { status: 400, body: { error: 'アップロードが完了していません' } }
  const info = (await head.json().catch(() => ({}))) as { size?: number; contentType?: string }
  const size = Number(info.size ?? 0)

  const created = await prisma.caseFile.create({
    data: {
      caseId,
      field: UPLOAD_FIELD,
      category,
      name,
      mime: info.contentType || input.mime || 'application/octet-stream',
      size: Number.isFinite(size) && size > 0 ? size : 0,
      storagePath,
      uploadedBy: actor.email ?? '',
    },
    select: {
      id: true, caseId: true, field: true, category: true, name: true,
      mime: true, size: true, uploadedBy: true, createdAt: true,
    },
  })
  await writeAudit({
    actor,
    action: 'CREATE',
    entity: 'CaseFile',
    entityId: String(created.id),
    summary: `受任資料アップロード: ${category} / ${name}（${(created.size / 1024).toFixed(0)}KB）`,
    metadata: { caseId },
  })
  return {
    status: 200,
    body: { ok: true, file: { ...created, createdAt: created.createdAt.toISOString() } },
  }
}

/**
 * 資料を削除する。Storage の実体も消す。
 * kintone から移した分（相談票添付・和解ファイル）は移行元の記録なので消させない。
 */
export async function deleteCaseFile(
  actor: Actor,
  fileId: number,
): Promise<{ status: number; body: unknown }> {
  if (!storageConfigured())
    return { status: 503, body: { error: 'SUPABASE_URL / SUPABASE_SECRET_KEY が未設定です' } }

  const row = await prisma.caseFile.findUnique({ where: { id: fileId } })
  if (!row) return { status: 404, body: { error: 'not found' } }
  if (row.field !== UPLOAD_FIELD)
    return {
      status: 400,
      body: { error: 'kintoneから移行した資料は削除できません（移行元の記録のため）' },
    }

  const r = await fetch(`${SUPABASE_URL()}/storage/v1/object/${BUCKET()}/${row.storagePath}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  // 404（既に無い）は成功扱い。実体だけ残ると孤児になるので、それ以外の失敗は止める
  if (!r.ok && r.status !== 404) {
    const detail = await r.text().catch(() => '')
    return { status: 502, body: { error: `削除に失敗しました (${r.status}) ${detail.slice(0, 200)}` } }
  }
  await prisma.caseFile.delete({ where: { id: fileId } })
  await writeAudit({
    actor,
    action: 'DELETE',
    entity: 'CaseFile',
    entityId: String(fileId),
    summary: `受任資料削除: ${row.category ?? ''} / ${row.name}`,
    metadata: { caseId: row.caseId },
  })
  return { status: 200, body: { ok: true } }
}
