/**
 * GMO API呼び出しを固定IPプロキシ（Lightsail）経由にする fetch ラッパー。
 *
 * 環境変数:
 *   GMO_PROXY_URL  … http://<LightsailのIP>:8888
 *                    Production: http://13.193.67.46:8888
 *                    Preview/Development: http://18.182.181.135:8888
 *   GMO_PROXY_USER … gmoproxy
 *   GMO_PROXY_PASS … tinyproxy の BasicAuth に設定したパスワード（本番/開発で別）
 *
 * GMO_PROXY_URL 未設定時は素の fetch にフォールバックする
 * （ローカル検証やプロキシ障害時の一時回避に使える）。
 *
 * HTTP CONNECT トンネル方式のため、TLS は Vercel→GMO 間で
 * エンドツーエンドに維持される（プロキシは通信内容を復号できない）。
 */
import { fetch as undiciFetch, ProxyAgent } from 'undici'

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

/** GMO向けfetch。プロキシ設定があればLightsail経由（固定IP）で送信する */
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
