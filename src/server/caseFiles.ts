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
