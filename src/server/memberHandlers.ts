/**
 * メンバー（スタッフ）管理の実処理（ADMIN 限定・トランスポート非依存）。
 * 一覧 / 追加 / 更新(ロール・状態・氏名) / パスワード再発行。
 * すべての変更で AuditLog（行動ログ）と ChangeLog（変更履歴: before/after）を記録する。
 *
 *   GET    /api/members                     一覧
 *   POST   /api/members                     追加
 *   PATCH  /api/members/:id                 更新（name/role/status）
 *   POST   /api/members/:id/reset-password  パスワード再発行
 */
import type { User } from '@prisma/client'
import { prisma } from './db.js'
import { hashPassword, toSafeUser } from './auth.js'
import { writeAudit, writeChange, diffFields } from './audit.js'

export type ApiResult = { status: number; body: unknown }
export type Actor = Pick<User, 'id' | 'email' | 'role'>
export type ReqMeta = { ip?: string | null; userAgent?: string | null }

const ROLE_LABEL: Record<string, string> = { ADMIN: '管理者', STAFF: 'スタッフ' }
const STATUS_LABEL: Record<string, string> = { ACTIVE: '有効', DISABLED: '無効' }
const FIELD_LABEL: Record<string, string> = {
  name: '氏名',
  role: 'ロール',
  status: '状態',
}

/** 変更履歴・APIに出す安全なスナップショット（パスワードを含まない） */
function snapshot(u: User) {
  return { email: u.email, name: u.name, role: u.role, status: u.status }
}

function forbidden(): ApiResult {
  return { status: 403, body: { error: '管理者権限が必要です' } }
}

function ensureAdmin(actor: Actor | null): actor is Actor {
  return !!actor && actor.role === 'ADMIN'
}

function parseBody(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

// ── 一覧 ─────────────────────────────────────────────────
export async function listMembers(
  actor: Actor | null,
  meta: ReqMeta
): Promise<ApiResult> {
  if (!ensureAdmin(actor)) return forbidden()
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
  await writeAudit({
    actor: { id: actor.id, email: actor.email },
    action: 'VIEW',
    entity: 'Member',
    summary: 'メンバー一覧を閲覧',
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
  return { status: 200, body: { members: users.map(toSafeUser) } }
}

// ── 追加 ─────────────────────────────────────────────────
export async function createMember(
  actor: Actor | null,
  raw: string,
  meta: ReqMeta
): Promise<ApiResult> {
  if (!ensureAdmin(actor)) return forbidden()
  const b = parseBody(raw)
  const email = String(b.email ?? '').trim().toLowerCase()
  const name = b.name != null ? String(b.name).trim() : null
  const role = b.role === 'ADMIN' ? 'ADMIN' : 'STAFF'
  const password = String(b.password ?? '')

  if (!email) return { status: 400, body: { error: 'ID（ログイン名）は必須です' } }
  if (password.length < 8)
    return { status: 400, body: { error: 'パスワードは8文字以上にしてください' } }

  const dup = await prisma.user.findUnique({ where: { email } })
  if (dup) return { status: 409, body: { error: 'このIDは既に使われています' } }

  const user = await prisma.user.create({
    data: { email, name, role, status: 'ACTIVE', passwordHash: hashPassword(password) },
  })

  await writeChange({
    actor: { id: actor.id, email: actor.email },
    entity: 'User',
    entityId: user.id,
    action: 'CREATE',
    after: snapshot(user),
  })
  await writeAudit({
    actor: { id: actor.id, email: actor.email },
    action: 'CREATE',
    entity: 'User',
    entityId: user.id,
    summary: `メンバー追加: ${name ?? email}（${ROLE_LABEL[role]}）`,
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return { status: 201, body: { member: toSafeUser(user) } }
}

// ── 更新（氏名・ロール・状態） ───────────────────────────
export async function updateMember(
  actor: Actor | null,
  id: string,
  raw: string,
  meta: ReqMeta
): Promise<ApiResult> {
  if (!ensureAdmin(actor)) return forbidden()
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return { status: 404, body: { error: 'メンバーが見つかりません' } }

  const b = parseBody(raw)
  const next: { name?: string | null; role?: 'ADMIN' | 'STAFF'; status?: 'ACTIVE' | 'DISABLED' } = {}
  if ('name' in b) next.name = b.name != null ? String(b.name).trim() : null
  if ('role' in b) next.role = b.role === 'ADMIN' ? 'ADMIN' : 'STAFF'
  if ('status' in b) next.status = b.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE'

  const demoting = next.role === 'STAFF' && target.role === 'ADMIN'
  const disabling = next.status === 'DISABLED' && target.status === 'ACTIVE'

  // 自己ロックアウト防止
  if (actor.id === target.id && (demoting || disabling)) {
    return { status: 400, body: { error: '自分自身の権限/状態は変更できません' } }
  }
  // 最後の有効な管理者を失わない
  if (demoting || disabling) {
    const activeAdmins = await prisma.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    })
    if (activeAdmins <= 1 && target.role === 'ADMIN' && target.status === 'ACTIVE') {
      return { status: 400, body: { error: '最後の有効な管理者は変更できません' } }
    }
  }

  const before = snapshot(target)
  const updated = await prisma.user.update({ where: { id }, data: next })
  const after = snapshot(updated)
  const diff = diffFields(before, after, ['name', 'role', 'status'])
  if (Object.keys(diff).length === 0) {
    return { status: 200, body: { member: toSafeUser(updated) } }
  }

  // 表示用に role/status は日本語ラベルへ
  const labelize = (v: unknown) =>
    ROLE_LABEL[String(v)] ?? STATUS_LABEL[String(v)] ?? (v == null || v === '' ? '空' : String(v))
  const summary = Object.entries(diff)
    .map(([k, v]) => `${FIELD_LABEL[k] ?? k}: ${labelize(v.before)}→${labelize(v.after)}`)
    .join(' / ')

  await writeChange({
    actor: { id: actor.id, email: actor.email },
    entity: 'User',
    entityId: id,
    action: 'UPDATE',
    before,
    after,
  })
  await writeAudit({
    actor: { id: actor.id, email: actor.email },
    action: 'UPDATE',
    entity: 'User',
    entityId: id,
    summary: `${target.name ?? target.email}: ${summary}`,
    metadata: diff,
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return { status: 200, body: { member: toSafeUser(updated) } }
}

// ── パスワード再発行 ─────────────────────────────────────
export async function resetPassword(
  actor: Actor | null,
  id: string,
  raw: string,
  meta: ReqMeta
): Promise<ApiResult> {
  if (!ensureAdmin(actor)) return forbidden()
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return { status: 404, body: { error: 'メンバーが見つかりません' } }

  const b = parseBody(raw)
  const password = String(b.password ?? '')
  if (password.length < 8)
    return { status: 400, body: { error: 'パスワードは8文字以上にしてください' } }

  await prisma.user.update({
    where: { id },
    data: { passwordHash: hashPassword(password) },
  })
  // セキュリティ: 当該ユーザーの既存セッションを失効
  await prisma.session.deleteMany({ where: { userId: id } })

  // パスワードはログに残さない（事実のみ）
  await writeAudit({
    actor: { id: actor.id, email: actor.email },
    action: 'UPDATE',
    entity: 'User',
    entityId: id,
    summary: `パスワード再発行: ${target.name ?? target.email}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return { status: 200, body: { ok: true } }
}
