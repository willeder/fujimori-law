/**
 * GMOあおぞらネット銀行 オープンAPI クライアント（No.153）
 *
 * 「オープンAPI仕様書 認可編（OAuth2.0）v1.20.0」に基づく実装。
 *   - 認可エンドポイント : GET  {BASE}/ganb/api/auth/v1/authorization
 *   - トークンエンドポイント: POST {BASE}/ganb/api/auth/v1/token
 *   - ユーザー情報        : GET  {BASE}/ganb/api/auth/v1/userinfo
 *   - 各APIの呼び出しは アクセストークンを「x-access-token」ヘッダーに設定
 *
 * 環境変数:
 *   GMO_API_BASE      … 本番: https://api.gmo-aozora.com / 開発(sunabar): https://stg-api.gmo-aozora.com
 *   GMO_CLIENT_ID     … クライアントID（銀行発行）
 *   GMO_CLIENT_SECRET … クライアントシークレット（銀行発行）
 *   GMO_REDIRECT_URI  … 事前登録済みリダイレクトURI（本番/開発は別登録）
 *   GMO_AUTH_METHOD   … クライアント認証方式 "basic"（既定・推奨） or "post"
 *   GMO_SCOPE         … 要求スコープ（既定 "private:account private:virtual-account"）
 *   GMO_DEPOSIT_PATH  … 入出金明細取得APIのパス（照会系仕様書の受領後に確定）
 *
 * トークンは DB（gmo_api_tokens・1行運用）に保存し、期限が近づいたら
 * リフレッシュトークンで自動更新する。
 */
import { randomBytes } from 'node:crypto'
import { prisma } from './db.js'
import { writeAudit, type Actor } from './audit.js'

const BASE = () => (process.env.GMO_API_BASE ?? 'https://stg-api.gmo-aozora.com').replace(/\/$/, '')
const CLIENT_ID = () => process.env.GMO_CLIENT_ID ?? ''
const CLIENT_SECRET = () => process.env.GMO_CLIENT_SECRET ?? ''
const REDIRECT_URI = () => process.env.GMO_REDIRECT_URI ?? ''
const AUTH_METHOD = () => (process.env.GMO_AUTH_METHOD === 'post' ? 'post' : 'basic')
const SCOPE = () => process.env.GMO_SCOPE ?? 'private:account private:virtual-account'

/** アクセストークンの残り有効期間がこの秒数を切ったらリフレッシュする */
const REFRESH_MARGIN_SECONDS = 300

export function isConfigured(): boolean {
  return CLIENT_ID() !== '' && CLIENT_SECRET() !== '' && REDIRECT_URI() !== ''
}

type TokenRow = {
  id: number
  accessToken: string | null
  refreshToken: string | null
  scope: string | null
  expiresAt: Date | null
  pendingState: string | null
}

async function getRow(): Promise<TokenRow> {
  const rows = await prisma.$queryRawUnsafe<TokenRow[]>(
    'SELECT "id", "accessToken", "refreshToken", "scope", "expiresAt", "pendingState" FROM gmo_api_tokens ORDER BY "id" ASC LIMIT 1'
  )
  if (rows.length > 0) return rows[0]
  await prisma.$executeRawUnsafe(
    'INSERT INTO gmo_api_tokens ("accessToken", "refreshToken", "scope", "expiresAt", "pendingState", "updatedAt") VALUES (NULL, NULL, NULL, NULL, NULL, NOW())'
  )
  const created = await prisma.$queryRawUnsafe<TokenRow[]>(
    'SELECT "id", "accessToken", "refreshToken", "scope", "expiresAt", "pendingState" FROM gmo_api_tokens ORDER BY "id" ASC LIMIT 1'
  )
  return created[0]
}

async function saveTokens(row: {
  accessToken: string
  refreshToken: string
  scope: string | null
  expiresIn: number
}): Promise<void> {
  const base = await getRow()
  await prisma.$executeRawUnsafe(
    `UPDATE gmo_api_tokens SET "accessToken" = $1, "refreshToken" = $2, "scope" = $3,
       "expiresAt" = NOW() + ($4 || ' seconds')::interval, "pendingState" = NULL, "updatedAt" = NOW()
     WHERE "id" = $5`,
    row.accessToken,
    row.refreshToken,
    row.scope,
    String(row.expiresIn),
    base.id
  )
}

/** 認可URL（銀行のログイン・認可画面）を生成し、CSRF対策の state を保存する */
export async function buildAuthorizationUrl(): Promise<{ url: string; state: string }> {
  const state = randomBytes(16).toString('hex')
  const row = await getRow()
  await prisma.$executeRawUnsafe(
    'UPDATE gmo_api_tokens SET "pendingState" = $1, "updatedAt" = NOW() WHERE "id" = $2',
    state,
    row.id
  )
  const q = new URLSearchParams({
    client_id: CLIENT_ID(),
    redirect_uri: REDIRECT_URI(),
    response_type: 'code',
    scope: SCOPE(),
    state,
  })
  return { url: `${BASE()}/ganb/api/auth/v1/authorization?${q.toString()}`, state }
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  scope?: string
  token_type: string
  expires_in: number
}

async function callTokenEndpoint(params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams(params)
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (AUTH_METHOD() === 'basic') {
    headers.Authorization =
      'Basic ' + Buffer.from(`${CLIENT_ID()}:${CLIENT_SECRET()}`).toString('base64')
  } else {
    body.set('client_id', CLIENT_ID())
    body.set('client_secret', CLIENT_SECRET())
  }
  const r = await fetch(`${BASE()}/ganb/api/auth/v1/token`, {
    method: 'POST',
    headers,
    body: body.toString(),
  })
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) {
    throw new Error(
      `GMOトークン取得に失敗 (HTTP ${r.status}): ${String(json.error ?? '')} ${String(json.error_description ?? '')}`
    )
  }
  return json as unknown as TokenResponse
}

/** 認可コードをアクセストークンへ交換して保存する（コールバックから呼ぶ） */
export async function exchangeCode(
  actor: Actor | null,
  code: string,
  state: string
): Promise<{ ok: boolean; error?: string }> {
  const row = await getRow()
  if (!row.pendingState || row.pendingState !== state) {
    return { ok: false, error: 'state が一致しません（認可を最初からやり直してください）' }
  }
  const t = await callTokenEndpoint({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI(),
  })
  await saveTokens({
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    scope: t.scope ?? null,
    expiresIn: t.expires_in,
  })
  await writeAudit({
    actor,
    action: 'UPDATE',
    entity: 'GmoApiToken',
    summary: 'GMOあおぞらAPI連携: アクセストークンを取得',
    metadata: { scope: t.scope ?? null, expiresIn: t.expires_in },
  })
  return { ok: true }
}

/** リフレッシュトークンでアクセストークンを更新する */
export async function refreshAccessToken(): Promise<void> {
  const row = await getRow()
  if (!row.refreshToken) throw new Error('リフレッシュトークンがありません（再認可が必要です）')
  const t = await callTokenEndpoint({
    grant_type: 'refresh_token',
    refresh_token: row.refreshToken,
  })
  await saveTokens({
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    scope: t.scope ?? null,
    expiresIn: t.expires_in,
  })
}

/** 有効なアクセストークンを返す（期限が近ければ自動リフレッシュ） */
export async function getValidAccessToken(): Promise<string> {
  const row = await getRow()
  if (!row.accessToken) throw new Error('未連携です（認可を実行してください）')
  const exp = row.expiresAt ? row.expiresAt.getTime() : 0
  if (exp - Date.now() < REFRESH_MARGIN_SECONDS * 1000) {
    await refreshAccessToken()
    const updated = await getRow()
    if (!updated.accessToken) throw new Error('トークン更新に失敗しました')
    return updated.accessToken
  }
  return row.accessToken
}

/** 連携ステータス（画面表示用。トークンそのものは返さない） */
export async function getStatus(): Promise<{
  configured: boolean
  connected: boolean
  scope: string | null
  expiresAt: string | null
  base: string
}> {
  const configured = isConfigured()
  let row: TokenRow | null = null
  try {
    row = await getRow()
  } catch {
    row = null
  }
  return {
    configured,
    connected: !!row?.refreshToken,
    scope: row?.scope ?? null,
    expiresAt: row?.expiresAt ? row.expiresAt.toISOString() : null,
    base: BASE(),
  }
}

/** 認可済みトークンで GMO API を GET する汎用ヘルパー（x-access-token ヘッダー） */
export async function gmoGet(path: string, params?: Record<string, string>): Promise<unknown> {
  const token = await getValidAccessToken()
  const q = params ? `?${new URLSearchParams(params).toString()}` : ''
  const r = await fetch(`${BASE()}${path}${q}`, {
    headers: { 'x-access-token': token, Accept: 'application/json' },
  })
  const json = (await r.json().catch(() => ({}))) as unknown
  if (!r.ok) {
    throw new Error(`GMO API エラー (HTTP ${r.status}) ${path}: ${JSON.stringify(json).slice(0, 300)}`)
  }
  return json
}

/** ユーザー情報エンドポイント（連携確認用） */
export async function getUserInfo(): Promise<unknown> {
  return gmoGet('/ganb/api/auth/v1/userinfo')
}

/**
 * 入出金明細の取得。
 * 具体的なパス・パラメータは照会系API仕様書の受領後に確定するため、
 * 環境変数 GMO_DEPOSIT_PATH で差し替えられるようにしている。
 * （sunabar/本番で疎通確認する際は、照会系仕様書のエンドポイントを設定すること）
 */
export async function fetchDepositTransactions(
  params: Record<string, string>
): Promise<unknown> {
  const path = process.env.GMO_DEPOSIT_PATH
  if (!path) {
    throw new Error(
      'GMO_DEPOSIT_PATH が未設定です。照会系API仕様書（入出金明細）のエンドポイントを設定してください'
    )
  }
  return gmoGet(path, params)
}
