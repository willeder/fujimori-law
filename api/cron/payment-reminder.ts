/**
 * Vercel Function: 入金予定リマインドの日次バッチ（本番）。
 * vercel.json の crons から毎日呼ばれる（GET）。手動実行は POST も可。
 * CRON_SECRET 設定時は Authorization: Bearer <値> 一致を要求
 * （Vercel Cron は自動で付与する）。
 *
 * ?days=N で前倒し日数を変更（既定 1 = 前日）。
 * 実処理は src/server/paymentReminder.ts に集約。
 */
import {
  runPaymentReminder,
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

  const daysParam = new URL(req.url).searchParams.get('days')
  const daysBefore = daysParam !== null ? Number(daysParam) : DEFAULT_DAYS_BEFORE
  const summary = await runPaymentReminder(daysBefore)
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
