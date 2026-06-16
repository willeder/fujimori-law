/**
 * Vercel Function: 入金予定リマインドの日次バッチ（本番）。
 * vercel.json の crons から毎日呼ばれる（GET）。手動実行は POST も可。
 * CRON_SECRET 設定時は Authorization: Bearer <値> 一致を要求
 * （Vercel Cron は自動で付与する）。
 *
 * ?timing=3D|1D|0D_1|0D_2 … 入金催促4タイミングのいずれかを送信。
 *   - 3D   : 支払期日の3日前
 *   - 1D   : 前日
 *   - 0D_1 : 当日1回目
 *   - 0D_2 : 当日2回目（16:00時点で未入金）
 * ?days=N … 旧・汎用リマインド（既定 1 = 前日）。timing 未指定時のみ有効。
 *
 * ※ 4タイミングのロジックは実装済みだが、vercel.json への cron 登録（有効化）は
 *   未実施。運用開始時に各タイミングの送信時刻を crons へ追加すること
 *   （例: 3D/1D/0D_1 は午前、0D_2 は 16:00 JST）。
 *
 * 実処理は src/server/paymentReminder.ts に集約。
 */
import {
  runPaymentReminder,
  runReminderTiming,
  getTimingDef,
  DEFAULT_DAYS_BEFORE,
} from '../../src/server/paymentReminder.js'

export const config = { runtime: 'nodejs' }

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
  const summary =
    timing && getTimingDef(timing)
      ? await runReminderTiming(timing)
      : await runPaymentReminder(
          params.get('days') !== null ? Number(params.get('days')) : DEFAULT_DAYS_BEFORE
        )
  return new Response(JSON.stringify(summary), {
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
