/**
 * GMOあおぞらAPI呼び出し用の fetch ラッパー（固定IPプロキシ経由）
 *
 * 使い方:
 *   1) pnpm add undici
 *   2) Vercelの環境変数に以下を設定
 *        GMO_PROXY_URL  = http://<LightsailのIP>:8888   ← Production には本番IP①、
 *                                                          Preview/Development には開発IP② を設定
 *        GMO_PROXY_USER = gmoproxy
 *        GMO_PROXY_PASS = （起動スクリプトで設定したパスワード。本番/開発で別の値）
 *   3) GMOを呼ぶ箇所で fetch(...) の代わりに gmoFetch(...) を使う
 *
 * 仕組み: HTTP CONNECT トンネル方式のため、TLSは Vercel→GMO 間で
 * エンドツーエンドに維持される（プロキシは通信内容を復号できない）。
 */
import { ProxyAgent } from 'undici'

let dispatcher: ProxyAgent | undefined

function getDispatcher(): ProxyAgent {
  if (!dispatcher) {
    const url = process.env.GMO_PROXY_URL
    const user = process.env.GMO_PROXY_USER
    const pass = process.env.GMO_PROXY_PASS
    if (!url || !user || !pass) {
      throw new Error('GMO_PROXY_URL / GMO_PROXY_USER / GMO_PROXY_PASS が未設定です')
    }
    dispatcher = new ProxyAgent({
      uri: url,
      token: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
    })
  }
  return dispatcher
}

export function gmoFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    // Node実行環境のfetch(undici)はdispatcherオプションを受け付ける
    dispatcher: getDispatcher(),
  } as RequestInit)
}

/**
 * 送信元IPの確認用（デプロイ後に一度だけ叩いて、返ってきたIPが
 * 申込書に記載した固定IPと一致することを確認する）
 * 例: /api/gmo/_ipcheck のようなエンドポイントから呼ぶ
 */
export async function checkEgressIp(): Promise<string> {
  const res = await gmoFetch('https://api.ipify.org?format=json')
  const body = (await res.json()) as { ip: string }
  return body.ip
}

/**
 * GMO側の流量制限（プライベートアクセスは1TPS）対策:
 * 呼び出しを直列化し、1秒間隔を保証する簡易キュー。
 * GMO APIを複数回連続で呼ぶ処理（明細ページング等）はこれを通すこと。
 */
let lastCall = Promise.resolve()
export function gmoFetchThrottled(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const next = lastCall.then(async () => {
    const res = await gmoFetch(input, init)
    await new Promise((r) => setTimeout(r, 1100)) // 1TPS遵守（余裕をみて1.1秒）
    return res
  })
  lastCall = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}
