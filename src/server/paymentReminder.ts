/**
 * 入金予定リマインドの配信本体（サーバ専用・トランスポート非依存）。
 * Vite 開発サーバ（dbApiPlugin: GET/POST）と
 * Vercel Cron（api/cron/payment-reminder.ts）の双方から呼ばれる。
 *
 * 対象: 指定日が入金予定（案件全体行 creditorId=null）かつ未入金、
 *       LINE 連携済み（status=LINKED）の案件。
 * 冪等化: line_notification_logs を (caseId, scheduledDate, type) 一意で
 *         upsert し、二重送信を防止する。
 */
import { prisma } from './db.js'
import { pushText } from './line.js'

/** 既定: 入金予定日の「前日」に配信 */
export const DEFAULT_DAYS_BEFORE = 1

/** YYYY-MM-DD（UTC基準の Date を返す。@db.Date は UTC 00:00 で保存される） */
function dateOnlyUTC(base: Date, addDays: number): Date {
  const d = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate())
  )
  d.setUTCDate(d.getUTCDate() + addDays)
  return d
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function reminderText(name: string | null, dateStr: string): string {
  const m = Number(dateStr.slice(5, 7))
  const day = Number(dateStr.slice(8, 10))
  return `${name ? name + '様 ' : ''}いつもお世話になっております。\n${m}月${day}日がご入金の予定日です。お忘れのないようお願いいたします。\nご不明点は事務所までご連絡ください。`
}

export type ReminderSummary = {
  targetDate: string
  candidates: number
  sent: number
  skipped: number
  failed: number
}

/**
 * リマインド配信を実行する。
 * @param daysBefore 何日前に配信するか（既定 1 = 前日）
 */
export async function runPaymentReminder(
  daysBefore: number = DEFAULT_DAYS_BEFORE
): Promise<ReminderSummary> {
  const offset = Number.isFinite(daysBefore) ? daysBefore : DEFAULT_DAYS_BEFORE
  const target = dateOnlyUTC(new Date(), offset)
  const targetStr = ymd(target)

  // 対象: その日が入金予定（案件全体行）かつ未入金、連携済みの案件
  const due = await prisma.payment.findMany({
    where: { plannedDate: target, creditorId: null, actualDate: null },
    select: {
      caseId: true,
      case: {
        select: {
          name: true,
          lineLink: {
            select: { status: true, lineUserId: true },
          },
        },
      },
    },
  })

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const row of due) {
    const link = row.case.lineLink
    if (!link || link.status !== 'LINKED' || !link.lineUserId) {
      skipped++
      continue
    }
    const message = reminderText(row.case.name, targetStr)

    // 冪等化: (caseId, scheduledDate, type) 一意
    const log = await prisma.lineNotificationLog.upsert({
      where: {
        caseId_scheduledDate_type: {
          caseId: row.caseId,
          scheduledDate: target,
          type: 'PAYMENT_REMINDER',
        },
      },
      create: {
        caseId: row.caseId,
        scheduledDate: target,
        type: 'PAYMENT_REMINDER',
        status: 'PENDING',
        recipientLineUserId: link.lineUserId,
        messageContent: message,
      },
      update: {},
    })
    if (log.status === 'SENT') {
      skipped++
      continue
    }

    try {
      await pushText(link.lineUserId, message)
      await prisma.lineNotificationLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date() },
      })
      sent++
    } catch (e) {
      await prisma.lineNotificationLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          errorMessage: e instanceof Error ? e.message : String(e),
        },
      })
      failed++
    }
  }

  return { targetDate: targetStr, candidates: due.length, sent, skipped, failed }
}
