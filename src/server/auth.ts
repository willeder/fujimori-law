/**
 * 認証（サーバ専用）。軽量カスタム方式:
 *   - パスワード: node:crypto scrypt（外部依存なし）
 *   - セッション: DB（Session テーブル）に保存した不透明トークン
 *   - Cookie: http-only / SameSite=Lax /(本番)Secure
 *
 * Vite 開発サーバ（ssrLoadModule）と Vercel Functions の双方で動作する。
 */
import crypto from 'node:crypto'
import type { User } from '@prisma/client'
import { prisma } from './db'

export const SESSION_COOKIE = 'fl_session'
const SESSION_TTL_DAYS = 7
const SCRYPT_KEYLEN = 64

// ── パスワード（scrypt） ─────────────────────────────────
/** `scrypt$<saltHex>$<hashHex>` 形式で保存 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const dk = crypto.scryptSync(password, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`
}

export function verifyPassword(
  password: string,
  stored: string | null | undefined
): boolean {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, saltHex, hashHex] = parts
  try {
    const dk = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN)
    const expected = Buffer.from(hashHex, 'hex')
    return expected.length === dk.length && crypto.timingSafeEqual(expected, dk)
  } catch {
    return false
  }
}

// ── セッション（DB） ─────────────────────────────────────
export async function createSession(
  userId: string
): Promise<{ token: string; expires: Date }> {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000)
  await prisma.session.create({ data: { sessionToken: token, userId, expires } })
  return { token, expires }
}

/** トークンから有効なユーザーを取得（期限切れ・無効ユーザーは null） */
export async function getSessionUser(token: string | null): Promise<User | null> {
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    include: { user: true },
  })
  if (!session) return null
  if (session.expires < new Date()) {
    await prisma.session.deleteMany({ where: { sessionToken: token } })
    return null
  }
  if (session.user.status === 'DISABLED') return null
  return session.user
}

export async function destroySession(token: string | null): Promise<void> {
  if (!token) return
  await prisma.session.deleteMany({ where: { sessionToken: token } })
}

// ── Cookie ───────────────────────────────────────────────
export function parseCookies(
  cookieHeader: string | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!cookieHeader) return out
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

export function getSessionToken(
  cookieHeader: string | null | undefined
): string | null {
  return parseCookies(cookieHeader)[SESSION_COOKIE] ?? null
}

const isProd = process.env.NODE_ENV === 'production'

export function buildSessionCookie(token: string, expires: Date): string {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expires.toUTCString()}`,
  ]
  if (isProd) attrs.push('Secure')
  return attrs.join('; ')
}

export function buildClearCookie(): string {
  const attrs = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (isProd) attrs.push('Secure')
  return attrs.join('; ')
}

// ── クライアントへ渡す安全なユーザー形 ───────────────────
export type SafeUser = {
  id: string
  email: string
  name: string | null
  role: User['role']
  status: User['status']
  lastLoginAt: string | null
}

export function toSafeUser(u: User): SafeUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }
}
