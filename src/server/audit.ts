/**
 * 監査ログ・変更履歴（サーバ専用）。
 *   - writeAudit: 行動ログ（ログイン/CRUD/閲覧/エクスポート 等）を1行記録
 *   - writeChange: フィールド単位の before/after を保存（revert の対象）
 *   - diffFields: before/after オブジェクトから変更フィールドだけ抽出
 *
 * いずれも失敗してもアプリ本体を止めないよう、呼び出し側で握りつぶしてよい
 * （監査の取りこぼしより業務継続を優先する設計。ただしログには出す）。
 */
import type { AuditAction, ChangeAction, Prisma } from '@prisma/client'
import { prisma } from './db'

export type Actor = { id?: string | null; email?: string | null }

export type AuditInput = {
  actor?: Actor | null
  action: AuditAction
  entity?: string | null
  entityId?: string | null
  summary?: string | null
  metadata?: unknown
  ip?: string | null
  userAgent?: string | null
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        metadata:
          input.metadata == null
            ? undefined
            : (input.metadata as Prisma.InputJsonValue),
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  } catch (e) {
    console.error('writeAudit failed:', e)
  }
}

export type ChangeInput = {
  actor?: Actor | null
  entity: string
  entityId: string
  action: ChangeAction
  before?: unknown
  after?: unknown
}

/** 変更履歴を1件記録し、作成した行（id は文字列化）を返す */
export async function writeChange(
  input: ChangeInput
): Promise<{ id: string } | null> {
  try {
    const row = await prisma.changeLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        before:
          input.before == null ? undefined : (input.before as Prisma.InputJsonValue),
        after:
          input.after == null ? undefined : (input.after as Prisma.InputJsonValue),
      },
      select: { id: true },
    })
    return { id: row.id.toString() }
  } catch (e) {
    console.error('writeChange failed:', e)
    return null
  }
}

/** before/after の差分フィールドだけを { field: {before, after} } で返す */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  keys?: string[]
): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {}
  const fieldSet = new Set<string>(
    keys ?? [...Object.keys(before ?? {}), ...Object.keys(after ?? {})]
  )
  for (const k of fieldSet) {
    const b = before?.[k]
    const a = after?.[k]
    if (JSON.stringify(b) !== JSON.stringify(a)) out[k] = { before: b, after: a }
  }
  return out
}

/** 差分を「label: A → B」形式の要約文字列に */
export function summarizeDiff(
  diff: Record<string, { before: unknown; after: unknown }>,
  labels: Record<string, string> = {}
): string {
  const parts = Object.entries(diff).map(([k, v]) => {
    const label = labels[k] ?? k
    const b = v.before === null || v.before === undefined || v.before === '' ? '空' : String(v.before)
    const a = v.after === null || v.after === undefined || v.after === '' ? '空' : String(v.after)
    return `${label}: ${b}→${a}`
  })
  return parts.join(' / ')
}
