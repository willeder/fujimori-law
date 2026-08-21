/**
 * 流量制御（1TPS）が効いているかを確かめる検証スクリプト。
 *
 * GMOの接続試験【APIリクエスト制御試験】は必須項目で、
 *   「試験実施期間中にAPIリクエスト制御がされていないことが確認できた場合は再試験とする」
 * とあるため、試験の前にここで確認しておく。
 *
 * 手元にHTTPサーバを立て、同時に8本呼んだときに
 * **サーバへ実際に届いた時刻**の間隔を測る。GMOへは通信しない。
 *
 *   npx tsx scripts/gmo_tps_check.mts
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'

// 検証を短くするため間隔を300msにする（本番既定は1100ms）
process.env.GMO_TPS_MIN_INTERVAL_MS = process.env.GMO_TPS_MIN_INTERVAL_MS ?? '300'
const EXPECT = Number(process.env.GMO_TPS_MIN_INTERVAL_MS)

const { gmoFetchThrottled } = await import('../src/server/gmoProxy.js')

const hits: number[] = []
const t0 = Date.now()
const server = http.createServer((_req, res) => {
  hits.push(Date.now() - t0) // サーバに届いた時刻＝実際に通信した時刻
  res.end('{"ok":true}')
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
const port = (server.address() as AddressInfo).port

const N = 8
await Promise.all(Array.from({ length: N }, () => gmoFetchThrottled(`http://127.0.0.1:${port}/`)))
server.close()

hits.sort((a, b) => a - b)
const gaps = hits.slice(1).map((v, i) => v - hits[i])
const min = Math.min(...gaps)

console.log(`同時に ${N} 本呼び出しました`)
console.log('通信が届いた時刻(ms):', hits.join(', '))
console.log('間隔(ms):', gaps.join(', '))
console.log(`最小間隔: ${min}ms（期待 ${EXPECT}ms 以上）`)
console.log(min >= EXPECT * 0.95 ? '✅ 流量制御は効いています' : '❌ 制御できていません。再試験になります')
process.exit(min >= EXPECT * 0.95 ? 0 : 1)
