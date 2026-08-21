/**
 * GMOあおぞらネット銀行 オープンAPI — イベント通知（Webhook）の配信制御。
 *
 * 準拠仕様: docs/reference/api-spec-webhooks.pdf
 *   「オープンAPI仕様書 イベント通知編 Version 1.8.0」
 *
 * ここで扱うのは「通知を受け取る側の設定」ではなく、
 * 銀行側に対して **配信を開始／停止させる** API と、
 * 配信が止まっていた間に溜まった明細を **回収する** API。
 *
 *   POST /subscribe                          … 配信開始・停止
 *   GET  /unsentlist/va-deposit-transaction  … 未送信・送信エラーの明細を一括取得
 *
 * メインURL:
 *   https://{domain}/ganb/api/webhooks/v1
 *   本番 api.gmo-aozora.com / 開発 stg-api.gmo-aozora.com
 *
 * 認証は「クライアントID:クライアントシークレット」の Basic 認証。
 * 入出金明細などの照会系（x-access-token）とは方式が違う点に注意。
 *
 * ★ 重要
 *   Webhook の受け口（api/gmo/webhook.ts）を用意しただけでは通知は届かない。
 *   この subscribe() を1回実行して「配信開始」を要求する必要がある。
 *   また仕様書には次の記載があるため、止まったまま放置しないこと。
 *     ・配信エラーが1時間続くと自動的に配信停止状態へ移行する
 *     ・配信停止のまま14日経過したメッセージは削除される（復旧不能）
 */
import { gmoFetchThrottled } from './gmoProxy.js'
import { planDepositRows, applyDepositPlan } from './depositImport.js'
import { pickDeposits, EVENT_TYPE_VA_DEPOSIT } from './gmoWebhook.js'
import { writeAudit, type Actor } from './audit.js'

const BASE = () =>
  (process.env.GMO_API_BASE ?? 'https://stg-api.gmo-aozora.com').replace(/\/$/, '')
const WEBHOOKS_BASE = () => `${BASE()}/ganb/api/webhooks/v1`

const CLIENT_ID = () => process.env.GMO_CLIENT_ID ?? ''
const CLIENT_SECRET = () => process.env.GMO_CLIENT_SECRET ?? ''

/** 配信制御APIの認証ヘッダー（クライアントID:シークレットの Basic） */
function basicHeader(): string {
  return 'Basic ' + Buffer.from(`${CLIENT_ID()}:${CLIENT_SECRET()}`).toString('base64')
}

export function isConfigured(): boolean {
  return CLIENT_ID() !== '' && CLIENT_SECRET() !== ''
}

/** GMO のエラーレスポンスを読める文字列にする */
async function describeError(r: Response): Promise<string> {
  let detail = ''
  try {
    detail = (await r.text()).slice(0, 500)
  } catch {
    /* 本文が読めなくてもステータスだけは返す */
  }
  return `HTTP ${r.status}${detail ? ` ${detail}` : ''}`
}

export type SubscribeResult = { ok: boolean; status: number; message: string }

/**
 * 通知配信制御（POST /subscribe）。
 * @param start true=配信開始要求 / false=配信停止要求
 */
export async function subscribe(
  start: boolean,
  eventType: string = EVENT_TYPE_VA_DEPOSIT
): Promise<SubscribeResult> {
  if (!isConfigured()) {
    return { ok: false, status: 0, message: 'GMO_CLIENT_ID / GMO_CLIENT_SECRET が未設定です' }
  }
  const body = {
    subscribeStatus: start ? '1' : '0',
    eventTypes: [{ eventType }],
  }
  const r = await gmoFetchThrottled(`${WEBHOOKS_BASE()}/subscribe`, {
    method: 'POST',
    headers: {
      Authorization: basicHeader(),
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    return { ok: false, status: r.status, message: await describeError(r) }
  }
  return {
    ok: true,
    status: r.status,
    message: start
      ? '配信開始を要求しました（反映まで最大10分程度かかる場合があります）'
      : '配信停止を要求しました（完全に停止するまで最大10分程度かかる場合があります）',
  }
}

export type UnsentResult = {
  ok: boolean
  status: number
  /** 取得できた明細の件数 */
  fetched: number
  /** 入金スケジュールへ反映できた件数 */
  reflected: number
  /** 補充行の追加件数 */
  supplements: number
  /** 案件と突合できなかった件数 */
  unmatched: number
  message: string
}

const UNSENT_ACTOR: Actor = { email: 'gmo-unsent-list' }

/**
 * 未送信明細取得（GET /unsentlist/va-deposit-transaction）→ そのまま入金反映まで行う。
 *
 * 仕様書の注意:
 *   「本APIで取得された明細は配信済みとなるため配信再開後には通知されません」
 *   つまり取得した時点で銀行側のキューから消えるので、
 *   **取得したら必ず反映まで通す**（取りこぼすと二度と通知されない）。
 *   明細が無い場合は 404 Not Found が返る（異常ではない）。
 */
export async function fetchUnsentAndApply(
  eventType: string = EVENT_TYPE_VA_DEPOSIT
): Promise<UnsentResult> {
  const empty = { fetched: 0, reflected: 0, supplements: 0, unmatched: 0 }
  if (!isConfigured()) {
    return {
      ok: false,
      status: 0,
      ...empty,
      message: 'GMO_CLIENT_ID / GMO_CLIENT_SECRET が未設定です',
    }
  }
  const r = await gmoFetchThrottled(`${WEBHOOKS_BASE()}/unsentlist/${eventType}`, {
    method: 'GET',
    headers: { Authorization: basicHeader() },
  })

  if (r.status === 404) {
    return { ok: true, status: 404, ...empty, message: '未送信の明細はありません' }
  }
  if (!r.ok) {
    return { ok: false, status: r.status, ...empty, message: await describeError(r) }
  }

  let payload: unknown
  try {
    payload = await r.json()
  } catch {
    return {
      ok: false,
      status: r.status,
      ...empty,
      message: '応答をJSONとして解釈できませんでした',
    }
  }

  // Webhook 受信と同じパーサ・同じ判定を通す（ルールを2系統に分けない）
  const { rows } = pickDeposits(payload)
  if (rows.length === 0) {
    return {
      ok: true,
      status: r.status,
      ...empty,
      message: '応答に入金明細が含まれていませんでした',
    }
  }

  const plan = await planDepositRows(rows, 'json')
  const result = await applyDepositPlan(UNSENT_ACTOR, plan, 'gmo-unsent-list')
  await writeAudit({
    actor: UNSENT_ACTOR,
    action: 'UPDATE',
    entity: 'Payment',
    summary: `GMO未送信明細の回収: 取得${rows.length}件・反映${result.reflected}件・未突合${result.unmatched}件`,
    metadata: { source: 'gmo-unsent-list' },
  })
  return {
    ok: true,
    status: r.status,
    fetched: rows.length,
    reflected: result.reflected,
    supplements: result.supplements,
    unmatched: result.unmatched,
    message: `取得${rows.length}件のうち${result.reflected}件を反映しました`,
  }
}
