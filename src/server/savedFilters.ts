/**
 * 保存した絞り込み条件（共有フィルタ）の実処理。トランスポート非依存。
 *
 *   GET    /api/saved-filters?target=caseList  一覧（共有 + 自分の個人用）
 *   POST   /api/saved-filters                  作成
 *   PATCH  /api/saved-filters/:id              更新
 *   DELETE /api/saved-filters/:id              削除
 *
 * 権限:
 *   - 作成は全ログインユーザー可
 *   - 更新・削除は「作成者本人」または ADMIN のみ
 *   - PRIVATE は作成者本人にしか返さない
 *
 * 検索条件の中身（field 名）はここでは検証しない。実際の検索は searchCases が
 * 列名ホワイトリストで弾くため、保存時は構造とサイズだけを検証する。
 */
import type { Prisma, SavedFilter as SavedFilterRow, User } from '@prisma/client'
import { prisma } from './db.js'
import type {
  CaseListFilterPayload,
  SavedFilter as SavedFilterDto,
  SavedFilterScope,
} from '../types/savedFilter.js'

export type ApiResult = { status: number; body: unknown }
export type Actor = Pick<User, 'id' | 'email' | 'name' | 'role'>

/** 1ユーザーが作れる条件の上限（暴走防止） */
const MAX_PER_USER = 200
/** payload の JSON 文字列としての上限（およそ32KB） */
const MAX_PAYLOAD_BYTES = 32 * 1024
/** 詳細検索の条件行の上限 */
const MAX_CONDITIONS = 50
const MAX_NAME_LENGTH = 80
const MAX_DESCRIPTION_LENGTH = 500

function bad(message: string): ApiResult {
  return { status: 400, body: { error: message } }
}

function parseBody(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}') as unknown
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * クライアントから来た payload を検証して正規化する。
 * 想定外のキーは落とし、文字列以外は弾く（DB に素性の分からない JSON を入れない）。
 */
function normalizePayload(input: unknown): CaseListFilterPayload | null {
  if (!input || typeof input !== 'object') return null
  const src = input as Record<string, unknown>
  if (src.version !== 1) return null

  const rawConditions = Array.isArray(src.conditions) ? src.conditions : []
  if (rawConditions.length > MAX_CONDITIONS) return null
  const conditions: { field: string; value: string }[] = []
  for (const item of rawConditions) {
    if (!item || typeof item !== 'object') return null
    const c = item as Record<string, unknown>
    if (typeof c.field !== 'string' || typeof c.value !== 'string') return null
    conditions.push({ field: c.field, value: c.value })
  }

  const rawQuick = (src.quick ?? {}) as Record<string, unknown>
  const quick = {
    field: asString(rawQuick.field) || 'all',
    value: asString(rawQuick.value),
  }

  let sort: CaseListFilterPayload['sort'] = null
  if (src.sort && typeof src.sort === 'object') {
    const s = src.sort as Record<string, unknown>
    if (typeof s.key === 'string' && s.key) {
      sort = { key: s.key, order: s.order === 'desc' ? 'desc' : 'asc' }
    }
  }

  const payload: CaseListFilterPayload = { version: 1, quick, conditions, sort }
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_PAYLOAD_BYTES) return null
  return payload
}

function normalizeScope(value: unknown): SavedFilterScope | null {
  return value === 'SHARED' || value === 'PRIVATE' ? value : null
}

/** 作成者の表示名（未設定ならメールアドレス） */
function ownerLabel(owner: { name: string | null; email: string } | null | undefined): string {
  if (!owner) return '(削除されたユーザー)'
  return owner.name ?? owner.email
}

type RowWithOwner = SavedFilterRow & {
  owner: { id: string; name: string | null; email: string } | null
}

function toDto(row: RowWithOwner, actor: Actor): SavedFilterDto {
  return {
    id: row.id,
    target: row.target,
    name: row.name,
    description: row.description,
    scope: row.scope,
    payload: row.payload as unknown as CaseListFilterPayload,
    sortOrder: row.sortOrder,
    ownerId: row.ownerId,
    ownerLabel: ownerLabel(row.owner),
    canEdit: canEdit(row, actor),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** 更新・削除できるのは作成者本人と ADMIN のみ */
function canEdit(row: Pick<SavedFilterRow, 'ownerId'>, actor: Actor): boolean {
  return row.ownerId === actor.id || actor.role === 'ADMIN'
}

// ── 一覧 ─────────────────────────────────────────────────
export async function listSavedFilters(
  actor: Actor,
  target: string | null
): Promise<ApiResult> {
  const rows = await prisma.savedFilter.findMany({
    where: {
      target: target || 'caseList',
      // 共有はすべて / 個人用は自分のものだけ
      OR: [{ scope: 'SHARED' }, { scope: 'PRIVATE', ownerId: actor.id }],
    },
    include: { owner: { select: { id: true, name: true, email: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return { status: 200, body: rows.map((row) => toDto(row, actor)) }
}

// ── 作成 ─────────────────────────────────────────────────
export async function createSavedFilter(actor: Actor, raw: string): Promise<ApiResult> {
  const body = parseBody(raw)

  const name = asString(body.name).trim()
  if (!name) return bad('条件名を入力してください')
  if (name.length > MAX_NAME_LENGTH) return bad(`条件名は${MAX_NAME_LENGTH}文字以内で入力してください`)

  const description = asString(body.description).trim().slice(0, MAX_DESCRIPTION_LENGTH)

  const scope = normalizeScope(body.scope)
  if (!scope) return bad('公開範囲が不正です')

  const payload = normalizePayload(body.payload)
  if (!payload) return bad('保存する条件の形式が不正です')

  const count = await prisma.savedFilter.count({ where: { ownerId: actor.id } })
  if (count >= MAX_PER_USER) {
    return bad(`保存できる条件は1人${MAX_PER_USER}件までです。不要な条件を削除してください`)
  }

  const row = await prisma.savedFilter.create({
    data: {
      target: asString(body.target) || 'caseList',
      name,
      description: description || null,
      scope,
      payload: payload as unknown as Prisma.InputJsonValue,
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
      ownerId: actor.id,
    },
    include: { owner: { select: { id: true, name: true, email: true } } },
  })
  return { status: 201, body: toDto(row, actor) }
}

// ── 更新 ─────────────────────────────────────────────────
export async function updateSavedFilter(
  actor: Actor,
  id: string,
  raw: string
): Promise<ApiResult> {
  const current = await prisma.savedFilter.findUnique({ where: { id } })
  if (!current) return { status: 404, body: { error: 'not found' } }
  if (!canEdit(current, actor)) {
    return { status: 403, body: { error: 'この条件を編集できるのは作成者と管理者だけです' } }
  }

  const body = parseBody(raw)
  const data: Prisma.SavedFilterUpdateInput = {}

  if (body.name !== undefined) {
    const name = asString(body.name).trim()
    if (!name) return bad('条件名を入力してください')
    if (name.length > MAX_NAME_LENGTH) return bad(`条件名は${MAX_NAME_LENGTH}文字以内で入力してください`)
    data.name = name
  }
  if (body.description !== undefined) {
    const description = asString(body.description).trim().slice(0, MAX_DESCRIPTION_LENGTH)
    data.description = description || null
  }
  if (body.scope !== undefined) {
    const scope = normalizeScope(body.scope)
    if (!scope) return bad('公開範囲が不正です')
    data.scope = scope
  }
  if (body.payload !== undefined) {
    const payload = normalizePayload(body.payload)
    if (!payload) return bad('保存する条件の形式が不正です')
    data.payload = payload as unknown as Prisma.InputJsonValue
  }
  if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
    data.sortOrder = Number(body.sortOrder)
  }

  const row = await prisma.savedFilter.update({
    where: { id },
    data,
    include: { owner: { select: { id: true, name: true, email: true } } },
  })
  return { status: 200, body: toDto(row, actor) }
}

// ── 削除 ─────────────────────────────────────────────────
export async function deleteSavedFilter(actor: Actor, id: string): Promise<ApiResult> {
  const current = await prisma.savedFilter.findUnique({ where: { id } })
  if (!current) return { status: 404, body: { error: 'not found' } }
  if (!canEdit(current, actor)) {
    return { status: 403, body: { error: 'この条件を削除できるのは作成者と管理者だけです' } }
  }
  await prisma.savedFilter.delete({ where: { id } })
  return { status: 200, body: { ok: true } }
}
