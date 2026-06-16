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
import type { NotificationType } from '@prisma/client'
import { prisma } from './db.js'
import { pushText } from './line.js'
import { writeAudit, type Actor } from './audit.js'

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

// ============================================================
// 入金催促通知（4タイミング・テンプレ選択式）
// 手動送信（UIから）と自動送信（cron）の双方で同じロジックを使う。
// 重複防止は line_notification_logs の (caseId, scheduledDate, type) 一意。
// タイミングごとに type を分けることで、同一支払期日でも
// 3日前 / 前日 / 当日1回目 / 当日2回目 を別々に送信できる。
// ============================================================

/** 催促タイミング識別子 */
export type ReminderTiming = '3D' | '1D' | '0D_1' | '0D_2'

type TimingDef = {
  id: ReminderTiming
  label: string
  /** 支払期日の何日前に送るか（当日は 0） */
  daysBefore: number
  /** 二重送信防止に使う NotificationType */
  notificationType: NotificationType
}

/**
 * enum リテラルのキャスト。
 * Prisma クライアント未再生成の環境でも型エラーにしないため unknown 経由。
 * 実機では `prisma generate` 後に正規の enum 値として解決される。
 */
const asNT = (v: string): NotificationType => v as unknown as NotificationType

/** 4タイミングの定義（UI・サーバ・cron 共通） */
export const REMINDER_TIMINGS: TimingDef[] = [
  { id: '3D', label: '3日前', daysBefore: 3, notificationType: asNT('PAYMENT_REMINDER_3D') },
  { id: '1D', label: '前日', daysBefore: 1, notificationType: asNT('PAYMENT_REMINDER_1D') },
  { id: '0D_1', label: '当日1回目', daysBefore: 0, notificationType: asNT('PAYMENT_REMINDER_0D_1') },
  { id: '0D_2', label: '当日2回目', daysBefore: 0, notificationType: asNT('PAYMENT_REMINDER_0D_2') },
]

export function getTimingDef(t: string): TimingDef | undefined {
  return REMINDER_TIMINGS.find((x) => x.id === t)
}

/**
 * 既定テンプレート。差し込み変数（受信者ごとにサーバ側で置換）:
 *   {名前} {フリガナ} {ID} {期日} {支店名} {口座番号} {入金額}
 * 銀行名・口座名義・預金種目は預り金口座で固定。
 */
export const DEFAULT_REMINDER_TEMPLATE = `お世話になります。
司法書士法人 第一法務事務所でございます。

次回のお支払期日が近づいて参りましたのでご案内申し上げます。

次回お支払期日は{期日} 15：00までとなります。
事前のご入金も可能でございますので、期日前のご入金をお勧め致します。
※お支払期日が土日祝の場合、お振込みの時間帯や銀行によっては当日のご入金の確認が取れない事もございますので、今回のご入金期日が土日祝のご依頼者様は、お伝えしました期日までにお振込み頂きます様ご協力をお願い致します。

【預り金口座】
銀行名：GMOあおぞらネット銀行
支店名：{支店名}
預金種目：普通
口座番号：{口座番号}
口座名義：シホウ）ダイイチホウムジムシヨアズカリキングチ
入金額：{入金額}

尚、既にお振込み済の場合はご容赦頂けますようお願い致します。

引き続き宜しくお願い致します。

***------------------------------------------------------
司法書士法人 第一法務事務所
〒541-0045
大阪市中央区道修町1-7-10 アドバンスビル北浜4F
TEL：06-6226-7496
------------------------------------------------------***`

/** 期日フレーズ。3日前→「3日後の◯月◯日」/前日→「明日◯月◯日」/当日→「本日◯月◯日」 */
function duePhrase(daysBefore: number, dateStr: string): string {
  const m = Number(dateStr.slice(5, 7))
  const d = Number(dateStr.slice(8, 10))
  const md = `${m}月${d}日`
  if (daysBefore >= 2) return `${daysBefore}日後の${md}`
  if (daysBefore === 1) return `明日${md}`
  return `本日${md}`
}

type FillContext = {
  name: string | null
  furigana: string | null
  externalId: string | null
  due: string
  branch: string | null
  accountNumber: string | null
  amount: number | null
}

/** テンプレートの差し込み変数を受信者ごとに置換 */
export function fillReminderTemplate(tpl: string, ctx: FillContext): string {
  return tpl
    .replace(/\{名前\}/g, ctx.name ?? '')
    .replace(/\{フリガナ\}/g, ctx.furigana ?? '')
    .replace(/\{ID\}/g, ctx.externalId ?? '')
    .replace(/\{期日\}/g, ctx.due)
    .replace(/\{支店名\}/g, ctx.branch ?? '')
    .replace(/\{口座番号\}/g, ctx.accountNumber ?? '')
    .replace(/\{入金額\}/g, ctx.amount != null ? `${ctx.amount.toLocaleString()}円` : '')
}

export type ReminderCandidate = {
  caseId: number
  name: string | null
  furigana: string | null
  externalId: string | null
  plannedDate: string
  plannedAmount: number | null
  vAccountBranch: string | null
  vAccountNumber: string | null
  lineLinked: boolean
  alreadySent: boolean
}

/** 案件全体の入金予定行（未入金）から、指定タイミングの送信対象を抽出 */
async function findDueRows(timing: TimingDef, caseIds?: number[]) {
  const target = dateOnlyUTC(new Date(), timing.daysBefore)
  const rows = await prisma.payment.findMany({
    where: {
      plannedDate: target,
      creditorId: null,
      actualDate: null,
      ...(caseIds && caseIds.length > 0 ? { caseId: { in: caseIds } } : {}),
    },
    select: {
      caseId: true,
      plannedAmount: true,
      case: {
        select: {
          name: true,
          furigana: true,
          externalId: true,
          vAccountBranch: true,
          vAccountNumber: true,
          lineLink: { select: { status: true, lineUserId: true } },
        },
      },
    },
  })
  return { target, targetStr: ymd(target), rows }
}

/** UI 用：指定タイミングの送信候補一覧 */
export async function getReminderCandidates(
  timing: string
): Promise<{
  timing: string
  label: string
  targetDate: string
  defaultTemplate: string
  candidates: ReminderCandidate[]
}> {
  const def = getTimingDef(timing)
  if (!def)
    return { timing, label: '', targetDate: '', defaultTemplate: DEFAULT_REMINDER_TEMPLATE, candidates: [] }
  const { target, targetStr, rows } = await findDueRows(def)

  const logs = await prisma.lineNotificationLog.findMany({
    where: { scheduledDate: target, type: def.notificationType, status: 'SENT' },
    select: { caseId: true },
  })
  const sent = new Set(logs.map((l) => l.caseId))

  const candidates: ReminderCandidate[] = rows.map((row) => {
    const link = row.case.lineLink
    return {
      caseId: row.caseId,
      name: row.case.name,
      furigana: row.case.furigana,
      externalId: row.case.externalId,
      plannedDate: targetStr,
      plannedAmount: row.plannedAmount,
      vAccountBranch: row.case.vAccountBranch,
      vAccountNumber: row.case.vAccountNumber,
      lineLinked: link?.status === 'LINKED' && !!link.lineUserId,
      alreadySent: sent.has(row.caseId),
    }
  })
  return {
    timing: def.id,
    label: def.label,
    targetDate: targetStr,
    defaultTemplate: DEFAULT_REMINDER_TEMPLATE,
    candidates,
  }
}

type DueRow = Awaited<ReturnType<typeof findDueRows>>['rows'][number]

type DispatchCounts = { sent: number; skipped: number; failed: number }
type DispatchDetail = {
  caseId: number
  name: string | null
  result: 'sent' | 'skipped' | 'failed'
  reason?: string
}

/** 実配信（手動/自動共通）。LINE連携済みのみ送信、冪等ログで二重送信を防止 */
async function dispatchReminders(
  def: TimingDef,
  target: Date,
  targetStr: string,
  rows: DueRow[],
  template: string
): Promise<DispatchCounts & { results: DispatchDetail[] }> {
  let sent = 0
  let skipped = 0
  let failed = 0
  const results: DispatchDetail[] = []

  for (const row of rows) {
    const link = row.case.lineLink
    if (!link || link.status !== 'LINKED' || !link.lineUserId) {
      skipped++
      results.push({ caseId: row.caseId, name: row.case.name, result: 'skipped', reason: 'LINE未連携' })
      continue
    }

    const message = fillReminderTemplate(template, {
      name: row.case.name,
      furigana: row.case.furigana,
      externalId: row.case.externalId,
      due: duePhrase(def.daysBefore, targetStr),
      branch: row.case.vAccountBranch,
      accountNumber: row.case.vAccountNumber,
      amount: row.plannedAmount,
    })

    const log = await prisma.lineNotificationLog.upsert({
      where: {
        caseId_scheduledDate_type: {
          caseId: row.caseId,
          scheduledDate: target,
          type: def.notificationType,
        },
      },
      create: {
        caseId: row.caseId,
        scheduledDate: target,
        type: def.notificationType,
        status: 'PENDING',
        recipientLineUserId: link.lineUserId,
        messageContent: message,
      },
      update: {},
    })
    if (log.status === 'SENT') {
      skipped++
      results.push({ caseId: row.caseId, name: row.case.name, result: 'skipped', reason: '送信済み' })
      continue
    }

    try {
      await pushText(link.lineUserId, message)
      await prisma.lineNotificationLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date(), messageContent: message },
      })
      sent++
      results.push({ caseId: row.caseId, name: row.case.name, result: 'sent' })
    } catch (e) {
      await prisma.lineNotificationLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorMessage: e instanceof Error ? e.message : String(e) },
      })
      failed++
      results.push({
        caseId: row.caseId,
        name: row.case.name,
        result: 'failed',
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return { sent, skipped, failed, results }
}

type EditMeta = { ip?: string | null; userAgent?: string | null }

export type ReminderSendResponse = {
  status: number
  body: {
    ok: boolean
    error?: string
    timing?: ReminderTiming
    targetDate?: string
    total?: number
    sent?: number
    skipped?: number
    failed?: number
    results?: DispatchDetail[]
  }
}

/** 手動送信（UIから選択した案件に対して送信） */
export async function sendReminders(
  actor: Actor,
  raw: string,
  meta: EditMeta
): Promise<ReminderSendResponse> {
  let body: { timing?: string; caseIds?: number[]; template?: string }
  try {
    body = JSON.parse(raw || '{}') as typeof body
  } catch {
    return { status: 400, body: { ok: false, error: 'bad request' } }
  }
  const def = getTimingDef(body.timing ?? '')
  if (!def) return { status: 400, body: { ok: false, error: 'タイミング指定が不正です' } }
  const caseIds = Array.isArray(body.caseIds) ? body.caseIds.filter((n) => Number.isFinite(n)) : []
  if (caseIds.length === 0) return { status: 400, body: { ok: false, error: '送信対象がありません' } }
  const template = (body.template ?? '').trim() || DEFAULT_REMINDER_TEMPLATE

  const { target, targetStr, rows } = await findDueRows(def, caseIds)
  const { sent, skipped, failed, results } = await dispatchReminders(
    def,
    target,
    targetStr,
    rows,
    template
  )

  await writeAudit({
    actor,
    action: 'EXPORT',
    entity: 'PaymentReminder',
    entityId: null,
    summary: `入金催促送信[${def.label}]（送信${sent}・スキップ${skipped}・失敗${failed}）`,
    metadata: { timing: def.id, targetDate: targetStr, template, total: rows.length, sent, skipped, failed, results },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return {
    status: 200,
    body: { ok: true, timing: def.id, targetDate: targetStr, total: rows.length, sent, skipped, failed, results },
  }
}

/**
 * 自動送信（cron 用）。指定タイミングの全対象（LINE連携済み）へ送信する。
 * ※ 現状は cron への登録（有効化）はしていない。手動送信と同一ロジック。
 */
export async function runReminderTiming(
  timing: string,
  template: string = DEFAULT_REMINDER_TEMPLATE
): Promise<ReminderSummary> {
  const def = getTimingDef(timing)
  if (!def) return { targetDate: '', candidates: 0, sent: 0, skipped: 0, failed: 0 }
  const { target, targetStr, rows } = await findDueRows(def)
  const { sent, skipped, failed } = await dispatchReminders(def, target, targetStr, rows, template)
  return { targetDate: targetStr, candidates: rows.length, sent, skipped, failed }
}
