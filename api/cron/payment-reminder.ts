/**
 * Vercel Function: 日次バッチ（本番）。
 * vercel.json の crons から毎日 00:00 UTC（＝09:00 JST）に呼ばれる（GET）。
 *
 * ★ 2026-10-12 変更（入金リマインドの自動送信を停止）
 *   移行期間中は新システム側で入金実績（actualDate）を更新しない運用のため、
 *   「未入金」判定が実態と合わず、入金済みの依頼者にもリマインドLINEが
 *   送信されてしまう事故が発生した。
 *   そのため、このバッチからの LINE 送信は既定で行わない。
 *   送信するのは画面（入金催促ページ）からの手動送信のみとする。
 *
 *   将来、自動送信を再開する場合は環境変数
 *     PAYMENT_REMINDER_AUTO_SEND = 1
 *   を設定したうえで、入金実績が新システムで更新される運用になっていること、
 *   および対象者の絞り込み条件を必ず再確認すること。
 *   （未設定／1 以外は送信しない）
 *
 * 送信を行う場合のクエリ:
 *   ?timing=3D|1D|0D_1|0D_2 … 入金催促4タイミングのいずれかを送信。
 *     - 3D   : 支払期日の3日前
 *     - 1D   : 前日
 *     - 0D_1 : 当日1回目
 *     - 0D_2 : 当日2回目（16:00時点で未入金）
 *   ?days=N … 旧・汎用リマインド（既定 1 = 前日）。timing 未指定時のみ有効。
 *
 * CRON_SECRET 設定時は Authorization: Bearer <値> 一致を要求
 * （Vercel Cron は自動で付与する）。
 *
 * 実処理は src/server/paymentReminder.ts に集約。
 *
 * ついでに「出力したCSVの後片付け」もここで行う（2026-09-08 追加）。
 * CSV出力は本体を Supabase Storage の非公開バケットに置く方式にしたが、
 * 依頼者・債権者の個人情報を含むため置きっぱなしにしない。
 * 24時間より古いものをここで消す。cron を増やさずに済むので運用が軽い。
 * 自動送信を止めている間も、この後片付けだけは毎日動かす必要があるため
 * cron 自体は残している。
 */
import {
  runPaymentReminder,
  runReminderTiming,
  getTimingDef,
  DEFAULT_DAYS_BEFORE,
} from '../../src/server/paymentReminder.js'
import { purgeOldCsvExports } from '../../src/server/csvExportFile.js'

export const config = { runtime: 'nodejs' }

/** 自動送信の許可フラグ。既定（未設定）は送信しない。 */
function autoSendEnabled(): boolean {
  return process.env.PAYMENT_REMINDER_AUTO_SEND === '1'
}

async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    }
  }

  const params = new URL(req.url).searchParams
  const timing = params.get('timing')

  // ── LINE送信 ──────────────────────────────────────────────
  // 既定では一切送信しない。PAYMENT_REMINDER_AUTO_SEND=1 のときだけ送信する。
  let reminder: Record<string, unknown>
  if (!autoSendEnabled()) {
    reminder = {
      autoSend: false,
      sent: 0,
      reason:
        '入金リマインドの自動送信は停止中です（PAYMENT_REMINDER_AUTO_SEND が未設定）。送信は画面の入金催促からの手動操作のみ行われます。',
    }
  } else {
    const summary =
      timing && getTimingDef(timing)
        ? await runReminderTiming(timing)
        : await runPaymentReminder(
            params.get('days') !== null ? Number(params.get('days')) : DEFAULT_DAYS_BEFORE
          )
    reminder = { autoSend: true, ...summary }
  }

  // ── 出力済みCSVの後片付け（失敗しても結果は返す）──────────
  let csvExports: unknown
  try {
    csvExports = await purgeOldCsvExports()
  } catch (e) {
    csvExports = { error: e instanceof Error ? e.message : String(e) }
  }

  return new Response(JSON.stringify({ ...reminder, csvExports }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export async function GET(req: Request): Promise<Response> {
  return run(req)
}

export async function POST(req: Request): Promise<Response> {
  return run(req)
}
