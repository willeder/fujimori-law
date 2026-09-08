/**
 * 出力したCSVの一時保管（Supabase Storage・非公開バケット）。
 *
 * 事務所からのご報告（2026-09-08）:
 *   「CSV出力→テーブル選択→出力する→『CSVを作成できませんでした』」
 *
 * 原因: これまでは作ったCSVをそのまま応答本文で返していたが、Vercel Function の
 * 応答本文には 4.5MB の上限がある。実データでの出力サイズは
 *   債権者 5.7MB / 入金 18.3MB / 接触履歴 23.1MB
 * で3テーブルとも上限を超えており、500（FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE）
 * になっていた。テーブルを選ばない出力はブラウザ内で作っているため通っていた。
 *
 * 対応: 案件添付（caseFiles.ts）と同じ考え方にする。
 *   CSV本体は Storage に置き、応答は 1KB 未満の「署名付きURL」だけにする。
 *   ダウンロードはブラウザ → Storage の直接通信になるので、
 *   応答本文の上限にも実行時間の上限にも当たらなくなる。
 *
 * 公開アクセスについて（事務所と確認 2026-09-08）:
 *   「public なアクセスがなければ問題ない」
 *   バケットは必ず public:false で作る（下の ensureBucket）。既に同名の公開
 *   バケットがあった場合は作成もアップロードもせずエラーにする（作りっぱなしの
 *   公開バケットに個人情報を置かないため）。URLは期限付き署名（既定10分）のみ。
 *
 * 保管期間:
 *   出力CSVは依頼者・債権者の個人情報を含むため、置きっぱなしにしない。
 *   日次Cron（api/cron/payment-reminder.ts）から purgeOldCsvExports() を呼び、
 *   24時間より古いものを消す。手作業は不要。
 *
 * 必要な環境変数は caseFiles.ts と同じ（SUPABASE_URL / SUPABASE_SECRET_KEY）。
 * バケット名だけ分けている（既定 csv-exports）。案件添付（case-files・永続）と
 * 混ぜると「消してはいけないものを消す」事故が起きうるため。
 */
const SUPABASE_URL = () => (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const SECRET = () => process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const BUCKET = () => process.env.SUPABASE_EXPORT_BUCKET ?? 'csv-exports'

/** 署名付きURLの有効期限（秒）。押したらすぐ落ちてくる用途なので短くてよい */
export const SIGN_EXPIRES_SEC = 600

/** ここより古い出力CSVは日次Cronで消す（時間） */
export const RETENTION_HOURS = 24

/**
 * Supabase への認証ヘッダー。
 * 新しいキー（sb_secret_...）は JWT ではないので apikey で送る。
 * 旧 service_role キー（JWT形式）のときだけ Authorization も併せて付ける。
 * ※ caseFiles.ts と同じ理由・同じ形。
 */
function authHeaders(): Record<string, string> {
  const key = SECRET()
  const h: Record<string, string> = { apikey: key }
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`
  return h
}

export function exportStorageConfigured(): boolean {
  return SUPABASE_URL() !== '' && SECRET() !== ''
}

/**
 * 非公開バケットがあることを保証する。
 * 無ければ public:false で作る。既にあり、かつ公開設定だった場合は
 * アップロードせずエラーにする（個人情報を公開領域に置かないため）。
 */
async function ensureBucket(): Promise<void> {
  const name = BUCKET()
  const info = await fetch(`${SUPABASE_URL()}/storage/v1/bucket/${name}`, {
    headers: authHeaders(),
  })
  if (info.ok) {
    const b = (await info.json()) as { public?: boolean }
    if (b.public === true) {
      throw new Error(
        `バケット ${name} が公開設定になっています。非公開に変更してください（個人情報を含むCSVを置くため）`
      )
    }
    return
  }
  /*
    「まだ無い」の返り方が素直ではない点に注意。
    Supabase Storage は HTTP 400 を返し、本文のほうに 404 / NoSuchBucket が入る。
      400 {"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}
    HTTP のステータスだけで判定すると、初回に必ず失敗する（実機で確認済み）。
  */
  const detail = await info.text().catch(() => '')
  const missing =
    info.status === 404 || /NoSuchBucket|Bucket not found|"statusCode":"404"/.test(detail)
  if (!missing) {
    throw new Error(`バケットの確認に失敗しました (${info.status}) ${detail.slice(0, 200)}`)
  }
  const made = await fetch(`${SUPABASE_URL()}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    /*
      public:false が要件（事務所と確認 2026-09-08「public なアクセスがなければ問題ない」）。
      file_size_limit を明示しないとプロジェクト既定に従い、数十MBの出力で
      アップロードが途中で切られる。案件添付バケット（case-files）と同じ 1GB にする。
    */
    body: JSON.stringify({ id: name, name, public: false, file_size_limit: 1073741824 }),
  })
  // 同時に叩かれて先に作られていた場合（409）は成功扱い
  if (!made.ok && made.status !== 409) {
    const detail = await made.text().catch(() => '')
    throw new Error(`バケットの作成に失敗しました (${made.status}) ${detail.slice(0, 200)}`)
  }
}

/** ファイル名・パスに使えない文字を落とす */
function safeSegment(s: string): string {
  return s.replace(/[^0-9A-Za-z._-]/g, '_').slice(0, 64) || 'x'
}

/** 保存先のパス。誰の出力かで分けておくと、あとで追いやすい */
function storagePath(userKey: string, fileName: string): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `exports/${safeSegment(userKey)}/${stamp}-${safeSegment(fileName)}`
}

export type CsvExportResult = {
  /** 期限付き署名URL。これ以外の経路では開けない */
  url: string
  /** ブラウザが保存するときのファイル名 */
  fileName: string
  bytes: number
  expiresAt: string
  /** バケット内のパス（監査ログ用） */
  path: string
}

/**
 * CSVを非公開バケットに置き、期限付き署名URLを返す。
 * @param userKey 保存先を分けるためのキー（ユーザーIDやメール）
 * @param fileName ブラウザに保存させたい名前（日本語可）
 */
export async function putCsvExport(
  userKey: string,
  fileName: string,
  body: Buffer
): Promise<CsvExportResult> {
  if (!exportStorageConfigured()) {
    throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY が未設定です')
  }
  await ensureBucket()

  const path = storagePath(userKey, fileName)
  /*
    数十MBのアップロードは、混み合っていると接続を切られることがある
    （実機で ECONNRESET / 400 を確認。少し待って投げ直すと通る）。
    一度きりで諦めると利用者には「また出せなかった」に見えるので、
    間隔を空けて3回まで試す。
  */
  let lastError = ''
  let uploaded = false
  for (let attempt = 0; attempt < 3 && !uploaded; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1500))
    try {
      const up = await fetch(`${SUPABASE_URL()}/storage/v1/object/${BUCKET()}/${path}`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'no-store',
        },
        body: new Uint8Array(body),
      })
      if (up.ok) {
        uploaded = true
        break
      }
      const detail = await up.text().catch(() => '')
      lastError = `(${up.status}) ${detail.slice(0, 200)}`
      // 宛先や権限の誤りは投げ直しても直らないので即あきらめる
      if (up.status === 401 || up.status === 403 || up.status === 409) break
    } catch (e) {
      const cause = String((e as { cause?: { code?: string } }).cause?.code ?? '')
      lastError = `${e instanceof Error ? e.message : String(e)} ${cause}`.trim()
    }
  }
  if (!uploaded) throw new Error(`CSVの保存に失敗しました ${lastError}`)

  const sign = await fetch(`${SUPABASE_URL()}/storage/v1/object/sign/${BUCKET()}/${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: SIGN_EXPIRES_SEC }),
  })
  if (!sign.ok) {
    const detail = await sign.text().catch(() => '')
    throw new Error(`ダウンロードURLの発行に失敗しました (${sign.status}) ${detail.slice(0, 200)}`)
  }
  const data = (await sign.json()) as { signedURL?: string; signedUrl?: string }
  const rel = data.signedURL ?? data.signedUrl
  if (!rel) throw new Error('ダウンロードURLが応答に含まれていません')

  // 応答は "/object/sign/..." の相対パス。保存名は download= で渡す
  const url =
    `${SUPABASE_URL()}/storage/v1${rel.startsWith('/') ? rel : `/${rel}`}` +
    `&download=${encodeURIComponent(fileName)}`

  return {
    url,
    fileName,
    bytes: body.length,
    expiresAt: new Date(Date.now() + SIGN_EXPIRES_SEC * 1000).toISOString(),
    path,
  }
}

/**
 * 古い出力CSVを消す（日次Cronから呼ぶ）。
 * exports/<ユーザー>/... の2階層を辿り、更新時刻が古いものだけ削除する。
 */
export async function purgeOldCsvExports(
  hours = RETENTION_HOURS
): Promise<{ scanned: number; deleted: number; errors: string[] }> {
  const errors: string[] = []
  if (!exportStorageConfigured()) return { scanned: 0, deleted: 0, errors: ['storage未設定'] }

  const limitAt = Date.now() - hours * 3600_000

  type Entry = { name: string; updated_at?: string; created_at?: string; id?: string | null }
  const list = async (prefix: string): Promise<Entry[]> => {
    const r = await fetch(`${SUPABASE_URL()}/storage/v1/object/list/${BUCKET()}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    })
    if (!r.ok) {
      errors.push(`一覧の取得に失敗 (${r.status}) prefix=${prefix}`)
      return []
    }
    return (await r.json()) as Entry[]
  }

  let scanned = 0
  const doomed: string[] = []
  // 1階層目＝ユーザーごとのフォルダ（id が null のものはフォルダ）
  for (const dir of await list('exports/')) {
    if (dir.id) continue
    for (const f of await list(`exports/${dir.name}/`)) {
      if (!f.id) continue
      scanned += 1
      const at = Date.parse(f.updated_at ?? f.created_at ?? '')
      // 時刻が読めないものは消さない（消しすぎるより残すほうが安全）
      if (Number.isFinite(at) && at < limitAt) doomed.push(`exports/${dir.name}/${f.name}`)
    }
  }

  let deleted = 0
  // 一度に消せる数に上限があるので小分けにする
  for (let i = 0; i < doomed.length; i += 100) {
    const chunk = doomed.slice(i, i + 100)
    const r = await fetch(`${SUPABASE_URL()}/storage/v1/object/${BUCKET()}`, {
      method: 'DELETE',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: chunk }),
    })
    if (r.ok) deleted += chunk.length
    else errors.push(`削除に失敗 (${r.status}) ${chunk.length}件`)
  }

  return { scanned, deleted, errors }
}
