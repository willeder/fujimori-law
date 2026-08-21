/**
 * GMO API呼び出しを固定IPプロキシ（Lightsail）経由にする fetch ラッパーと、
 * オープンAPI の流量制限（プライベートアクセスは 1TPS）を守るためのゲート。
 *
 * 環境変数:
 *   GMO_PROXY_URL  … http://<LightsailのIP>:8888
 *                    Production: http://13.193.67.46:8888
 *                    Preview/Development: http://18.182.181.135:8888
 *   GMO_PROXY_USER … gmoproxy
 *   GMO_PROXY_PASS … tinyproxy の BasicAuth に設定したパスワード（本番/開発で別）
 *   GMO_TPS_MIN_INTERVAL_MS … 呼び出しの最小間隔（既定 1100ms）
 *   GMO_TPS_RETRY_MAX       … 流量超過エラー時の再試行回数（既定 3）
 *
 * GMO_PROXY_URL 未設定時は素の fetch にフォールバックする
 * （ローカル検証やプロキシ障害時の一時回避に使える）。
 *
 * HTTP CONNECT トンネル方式のため、TLS は Vercel→GMO 間で
 * エンドツーエンドに維持される（プロキシは通信内容を復号できない）。
 */
import { fetch as undiciFetch, ProxyAgent } from 'undici'
import { prisma } from './db.js'

type GmoFetchInit = {
  method?: string
  headers?: Record<string, string>
  body?: string
}

let agent: ProxyAgent | null | undefined

function getAgent(): ProxyAgent | null {
  if (agent !== undefined) return agent
  const url = process.env.GMO_PROXY_URL
  if (!url) {
    agent = null
    return agent
  }
  const user = process.env.GMO_PROXY_USER ?? ''
  const pass = process.env.GMO_PROXY_PASS ?? ''
  agent = new ProxyAgent({
    uri: url,
    token: user !== '' ? 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') : undefined,
  })
  return agent
}

/**
 * GMO向けfetch（流量制御なし）。
 * **GMOのAPIを呼ぶときは gmoFetchThrottled() を使ってください。**
 * こちらは疎通確認など、GMO以外や1回きりの呼び出し専用です。
 */
export async function gmoFetch(url: string, init: GmoFetchInit = {}): Promise<Response> {
  const a = getAgent()
  if (a === null) {
    return fetch(url, init as RequestInit)
  }
  const r = await undiciFetch(url, { ...init, dispatcher: a })
  return r as unknown as Response
}

/** 送信元IP確認用（一時的な疎通テストに使う） */
export async function checkEgressIp(): Promise<string> {
  const r = await gmoFetch('https://api.ipify.org?format=json')
  const j = (await r.json()) as { ip: string }
  return j.ip
}

// ============================================================
// 流量制御（1TPS）
// ------------------------------------------------------------
// GMOの接続試験には【APIリクエスト制御試験】があり、必須項目です。
//   「APIの並列アクセスをシステム制御し、**全体の流量**が規定TPS以下となるように」
//   「試験実施期間中にAPIリクエスト制御がされていないことが確認できた場合は再試験とする」
//
// Vercel は同時に複数のインスタンスが動くため、モジュール変数のキューでは
// 「全体の流量」を保証できません（インスタンスAとBが同時に1回ずつ呼べば2TPS）。
// そこで DB を共有ゲートにします。
//
//   1. pg_advisory_xact_lock で全インスタンスを1本に直列化する
//   2. gmo_rate_limit.lastCalledAt との差を見て、足りない分だけ待つ
//   3. lastCalledAt を now() に進めてロックを解放し、その後に実際の通信を行う
//
// あわせて、同一インスタンス内でもキューで直列化しておきます
// （DBロックの奪い合いを減らすため）。
// ============================================================

/** advisory lock のキー。他の用途と衝突しない固定値 */
const LOCK_KEY = 871200001

function minIntervalMs(): number {
  const v = Number(process.env.GMO_TPS_MIN_INTERVAL_MS ?? '1100')
  return Number.isFinite(v) && v > 0 ? v : 1100
}

function retryMax(): number {
  const v = Number(process.env.GMO_TPS_RETRY_MAX ?? '3')
  return Number.isFinite(v) && v >= 0 ? v : 3
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** プロセス内の直列化キュー */
let queue: Promise<unknown> = Promise.resolve()

/** 直前の呼び出し時刻（DBが使えないときの代替） */
let localLastCalledAt = 0

/**
 * 通信してよいタイミングまで待つ。
 * DBが使えない場合はプロセス内の時刻で代替する（無制限に流すことはしない）。
 */
async function waitForSlot(): Promise<void> {
  const interval = minIntervalMs()
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1)', LOCK_KEY)
        const rows = await tx.$queryRawUnsafe<Array<{ wait_ms: number }>>(
          `SELECT GREATEST(0, $1 - EXTRACT(EPOCH FROM (NOW() - "lastCalledAt")) * 1000)::int AS wait_ms
             FROM "gmo_rate_limit" WHERE "id" = 1`,
          interval,
        )
        const wait = Math.min(Number(rows[0]?.wait_ms ?? 0), interval)
        if (wait > 0) await sleep(wait)
        // 実際の通信より先に時刻を進める。通信が失敗しても枠は消費された扱いにする
        // （エラー時に間隔を詰めて再送し、かえって超過するのを防ぐため）
        await tx.$executeRawUnsafe('UPDATE "gmo_rate_limit" SET "lastCalledAt" = NOW() WHERE "id" = 1')
      },
      { timeout: 20000, maxWait: 20000 },
    )
    localLastCalledAt = Date.now()
    return
  } catch (e) {
    // DBに触れない状況でも、せめてプロセス内では間隔を守る
    console.warn('[gmo] 流量ゲートにDBを使えませんでした。プロセス内の制御に切り替えます:', e)
    const wait = localLastCalledAt + interval - Date.now()
    if (wait > 0) await sleep(wait)
    localLastCalledAt = Date.now()
  }
}

/**
 * 流量超過とみなすかどうか。
 *
 * ★未確定★ GMOの「流量超過時の専用エラーレスポンス」のコードは、
 * 手元の資料（申込書・接続情報通知書・イベント通知編仕様書）には記載がありません。
 * オープンAPI仕様書（共通編）を入手したらここに正確なコードを追加してください。
 * それまでは HTTP 429 と、環境変数で渡したコードだけを対象にします。
 * 判定できなかった応答も呼び出し元でログに残るので、接続試験中に実物を確認できます。
 */
function isRateLimited(status: number, body: string): boolean {
  if (status === 429) return true
  const codes = (process.env.GMO_TPS_ERROR_CODES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return codes.length > 0 && codes.some((c) => body.includes(c))
}

/**
 * GMO API を流量制御つきで呼ぶ。GMOのエンドポイントはすべてこれを通すこと。
 * 流量超過の応答を受けた場合は、間隔を空けて再試行する（接続試験の必須項目）。
 */
export async function gmoFetchThrottled(url: string, init: GmoFetchInit = {}): Promise<Response> {
  const run = async (): Promise<Response> => {
    const max = retryMax()
    for (let attempt = 0; ; attempt++) {
      await waitForSlot()
      const res = await gmoFetch(url, init)
      if (res.ok || attempt >= max) return res
      // 本文を読んでも呼び出し元が再度読めるように、読んだ内容で作り直す
      const text = await res.text()
      if (!isRateLimited(res.status, text)) {
        return new Response(text, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        })
      }
      const backoff = minIntervalMs() * Math.pow(2, attempt)
      console.warn(
        `[gmo] 流量超過とみなして再試行します（${attempt + 1}/${max}・${backoff}ms待機） status=${res.status}`,
      )
      await sleep(backoff)
    }
  }

  // プロセス内でも直列化する（DBロックの奪い合いを減らす）
  const next = queue.then(run, run)
  queue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}
