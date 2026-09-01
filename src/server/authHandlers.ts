/**
 * 認証エンドポイントの実処理（トランスポート非依存）。
 * Vite 開発サーバ（dbApiPlugin）と Vercel Functions（api/auth/*）の双方から呼ぶ。
 *
 *   POST /api/auth/login   { email, password } → セッション発行・Set-Cookie
 *   POST /api/auth/logout                       → セッション破棄・Cookie 消去
 *   GET  /api/auth/me                           → 現在のユーザー
 */
import { prisma } from './db.js'
import {
  buildClearCookie,
  buildSessionCookie,
  createSession,
  destroySession,
  getSessionToken,
  getSessionUser,
  toSafeUser,
  verifyPassword,
} from './auth.js'
import { writeAudit } from './audit.js'

export type AuthResponse = {
  status: number
  body: unknown
  setCookie?: string
}

export type RequestMeta = {
  ip?: string | null
  userAgent?: string | null
  cookieHeader?: string | null
}

export async function handleLogin(
  rawBody: string,
  meta: RequestMeta
): Promise<AuthResponse> {
  let email = ''
  let password = ''
  try {
    const parsed = JSON.parse(rawBody || '{}') as {
      email?: string
      password?: string
    }
    email = (parsed.email ?? '').trim().toLowerCase()
    password = parsed.password ?? ''
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  if (!email || !password) {
    return { status: 400, body: { error: 'メールとパスワードを入力してください' } }
  }

  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || !verifyPassword(password, user.passwordHash)) {
    await writeAudit({
      actor: { id: user?.id ?? null, email },
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: user?.id ?? null,
      summary: 'ログイン失敗',
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
    return { status: 401, body: { error: 'メールまたはパスワードが違います' } }
  }

  if (user.status === 'DISABLED') {
    await writeAudit({
      actor: { id: user.id, email: user.email },
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: user.id,
      summary: '無効化済みアカウントでのログイン試行',
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
    return { status: 403, body: { error: 'このアカウントは無効化されています' } }
  }

  const { token, expires } = await createSession(user.id)
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })
  await writeAudit({
    actor: { id: user.id, email: user.email },
    action: 'LOGIN',
    entity: 'User',
    entityId: user.id,
    summary: 'ログイン',
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return {
    status: 200,
    body: { user: toSafeUser({ ...user, lastLoginAt: new Date() }) },
    setCookie: buildSessionCookie(token, expires),
  }
}

export async function handleLogout(meta: RequestMeta): Promise<AuthResponse> {
  const token = getSessionToken(meta.cookieHeader)
  const user = await getSessionUser(token)
  await destroySession(token)
  if (user) {
    await writeAudit({
      actor: { id: user.id, email: user.email },
      action: 'LOGOUT',
      entity: 'User',
      entityId: user.id,
      summary: 'ログアウト',
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
  }
  return { status: 200, body: { ok: true }, setCookie: buildClearCookie() }
}

export async function handleMe(meta: RequestMeta): Promise<AuthResponse> {
  const user = await getSessionUser(getSessionToken(meta.cookieHeader))
  if (!user) return { status: 401, body: { error: 'unauthenticated' } }
  return { status: 200, body: { user: toSafeUser(user) } }
}

/** 画面の文字サイズとして受け付ける値 */
const UI_FONT_SCALES = ['large', 'standard', 'compact', 'dense'] as const

/**
 * 表示設定の保存（いまは文字サイズのみ）。
 * 文字サイズをアカウントごとに保持したい、というご要望（堀本様 2026-08-23）。
 * ブラウザ側だけに持っていると、同じPCを共有したときに別の人の設定が出たり、
 * 端末を変えると戻ったりするため、ユーザーの行に持たせる。
 */
export async function handleUpdatePreferences(
  raw: string,
  meta: RequestMeta
): Promise<AuthResponse> {
  const user = await getSessionUser(getSessionToken(meta.cookieHeader))
  if (!user) return { status: 401, body: { error: 'unauthenticated' } }

  let input: { uiFontScale?: unknown }
  try {
    input = JSON.parse(raw || '{}') as { uiFontScale?: unknown }
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }

  const data: { uiFontScale?: string | null } = {}
  if ('uiFontScale' in input) {
    const v = input.uiFontScale
    if (v === null) data.uiFontScale = null
    else if (typeof v === 'string' && (UI_FONT_SCALES as readonly string[]).includes(v)) {
      data.uiFontScale = v
    } else {
      return { status: 400, body: { error: '文字サイズの値が正しくありません' } }
    }
  }
  if (Object.keys(data).length === 0) {
    return { status: 200, body: { user: toSafeUser(user) } }
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data })
  return { status: 200, body: { user: toSafeUser(updated) } }
}
