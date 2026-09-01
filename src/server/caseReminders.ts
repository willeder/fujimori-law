/**
 * リマインド（案件ごとの「いつ・何をする」）。
 *
 * kintone では和解対象債権のサブテーブルに債権者名「★リマインド」の行を作り、
 *   次回処理日時 = いつやるか / 交渉相手の欄 = やること
 * として運用していた。債権者の行に混ざっているため債権社数・申告額の集計が
 * 狂うので、こちらでは独立した表（case_reminders）として持つ。
 *
 * 期日が来たものを拾えることが本来の目的なので、案件をまたいだ
 * 「期日到来リマインド」も同じモジュールから返す。
 */
import { prisma } from './db.js'
import { writeAudit, writeChange, type Actor } from './audit.js'

export type ReminderJson = {
  id: number
  caseId: number
  dueDate: string | null
  body: string
  done: boolean
  doneAt: string | null
  doneBy: string | null
  source: string
  createdAt: string
}

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

type ReminderRow = {
  id: number
  caseId: number
  dueDate: Date | null
  body: string
  done: boolean
  doneAt: Date | null
  doneBy: string | null
  source: string
  createdAt: Date
}

function toJson(r: ReminderRow): ReminderJson {
  return {
    id: r.id,
    caseId: r.caseId,
    dueDate: ymd(r.dueDate),
    body: r.body,
    done: r.done,
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
    doneBy: r.doneBy,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  }
}

/** 日付文字列（YYYY-MM-DD）→ Date。空欄は null */
function toDate(v: unknown): Date | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function listCaseReminders(caseId: number): Promise<ReminderJson[]> {
  const rows = await prisma.caseReminder.findMany({
    where: { caseId },
    // 未対応が先・期日の早い順。期日なしは最後
    orderBy: [{ done: 'asc' }, { dueDate: 'asc' }, { id: 'asc' }],
  })
  return rows.map(toJson)
}

export async function createCaseReminder(
  actor: Actor,
  caseId: number,
  raw: string,
): Promise<{ status: number; body: unknown }> {
  let input: { dueDate?: string; body?: string }
  try {
    input = JSON.parse(raw || '{}') as { dueDate?: string; body?: string }
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  const body = (input.body ?? '').trim()
  if (!body) return { status: 400, body: { error: '内容は必須です' } }
  const target = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, name: true } })
  if (!target) return { status: 404, body: { error: 'case not found' } }

  const created = await prisma.caseReminder.create({
    data: {
      caseId,
      dueDate: toDate(input.dueDate),
      body: body.slice(0, 2000),
      createdBy: actor.email ?? '',
      updatedBy: actor.email ?? '',
    },
  })
  await writeAudit({
    actor,
    action: 'CREATE',
    entity: 'CaseReminder',
    entityId: String(created.id),
    summary: `リマインド追加: ${target.name} / ${ymd(created.dueDate) ?? '期日なし'} ${body.slice(0, 40)}`,
    metadata: { caseId },
  })
  // 変更履歴にも残す。案件詳細の「変更履歴」から追えるようにするため
  // （堀本様 2026-08-22「誤って削除する可能性もあるので復元可能に」）。
  await writeChange({
    actor,
    entity: 'CaseReminder',
    entityId: String(created.id),
    action: 'CREATE',
    before: null,
    after: { caseId, dueDate: ymd(created.dueDate), body: created.body, done: created.done },
  })
  return { status: 200, body: { ok: true, reminder: toJson(created) } }
}

export async function updateCaseReminder(
  actor: Actor,
  id: number,
  raw: string,
): Promise<{ status: number; body: unknown }> {
  let input: { dueDate?: string | null; body?: string; done?: boolean }
  try {
    input = JSON.parse(raw || '{}') as { dueDate?: string | null; body?: string; done?: boolean }
  } catch {
    return { status: 400, body: { error: 'bad request' } }
  }
  const before = await prisma.caseReminder.findUnique({ where: { id } })
  if (!before) return { status: 404, body: { error: 'not found' } }

  const data: Record<string, unknown> = { updatedBy: actor.email ?? '' }
  if ('dueDate' in input) data.dueDate = toDate(input.dueDate)
  if (typeof input.body === 'string') {
    const b = input.body.trim()
    if (!b) return { status: 400, body: { error: '内容は必須です' } }
    data.body = b.slice(0, 2000)
  }
  if (typeof input.done === 'boolean') {
    data.done = input.done
    // 済にした人と時刻を残す（誰が処理したかを後から追えるように）
    data.doneAt = input.done ? new Date() : null
    data.doneBy = input.done ? (actor.email ?? '') : null
  }

  const updated = await prisma.caseReminder.update({ where: { id }, data })
  await writeAudit({
    actor,
    action: 'UPDATE',
    entity: 'CaseReminder',
    entityId: String(id),
    summary:
      typeof input.done === 'boolean'
        ? `リマインドを${input.done ? '済' : '未対応'}に変更: ${updated.body.slice(0, 40)}`
        : `リマインド更新: ${updated.body.slice(0, 40)}`,
    metadata: { caseId: updated.caseId },
  })
  await writeChange({
    actor,
    entity: 'CaseReminder',
    entityId: String(id),
    action: 'UPDATE',
    before: {
      caseId: before.caseId,
      dueDate: ymd(before.dueDate),
      body: before.body,
      done: before.done,
    },
    after: {
      caseId: updated.caseId,
      dueDate: ymd(updated.dueDate),
      body: updated.body,
      done: updated.done,
    },
  })
  return { status: 200, body: { ok: true, reminder: toJson(updated) } }
}

export async function deleteCaseReminder(
  actor: Actor,
  id: number,
): Promise<{ status: number; body: unknown }> {
  const row = await prisma.caseReminder.findUnique({ where: { id } })
  if (!row) return { status: 404, body: { error: 'not found' } }
  await prisma.caseReminder.delete({ where: { id } })
  await writeAudit({
    actor,
    action: 'DELETE',
    entity: 'CaseReminder',
    entityId: String(id),
    summary: `リマインド削除: ${row.body.slice(0, 40)}`,
    metadata: { caseId: row.caseId },
  })
  // 削除も変更履歴に残す。before に案件IDを入れておくと、行が消えたあとでも
  // 案件の変更履歴から拾える（getCaseChanges 参照）。
  await writeChange({
    actor,
    entity: 'CaseReminder',
    entityId: String(id),
    action: 'DELETE',
    before: { caseId: row.caseId, dueDate: ymd(row.dueDate), body: row.body, done: row.done },
    after: null,
  })
  return { status: 200, body: { ok: true } }
}

export type DueReminder = ReminderJson & {
  caseName: string
  externalId: string | null
  /** 期日までの日数。マイナスは超過日数 */
  daysLeft: number | null
}

/**
 * 期日が来ている（または過ぎている）未対応リマインドを案件をまたいで返す。
 * @param withinDays 何日先まで含めるか（既定7日。0なら本日まで）
 */
export async function listDueReminders(withinDays = 7): Promise<DueReminder[]> {
  const today = new Date()
  const todayYmd = today.toISOString().slice(0, 10)
  const until = new Date(today.getTime() + withinDays * 86400000)

  const rows = await prisma.caseReminder.findMany({
    where: { done: false, dueDate: { not: null, lte: until } },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    include: { case: { select: { name: true, externalId: true } } },
    take: 500,
  })
  const base = new Date(`${todayYmd}T00:00:00Z`).getTime()
  return rows.map((r) => ({
    ...toJson(r),
    caseName: r.case.name,
    externalId: r.case.externalId,
    daysLeft: r.dueDate ? Math.round((r.dueDate.getTime() - base) / 86400000) : null,
  }))
}
