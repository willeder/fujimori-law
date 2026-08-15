/**
 * GMOあおぞらネット銀行 オープンAPI — Webhook 受信（振込入金口座_入金明細通知）。
 *
 * 目的:
 *   V口座に入金があった瞬間に通知を受け、入金スケジュールの「実績」を自動で更新する。
 *   これまでは月次で入金明細CSVを取り込んでいたが、その処理をそのまま再利用する
 *   （突合・名義照合・充当のルールを2系統に分けないため）。
 *
 * 準拠仕様: docs/reference/api-spec-webhooks.pdf
 *   「オープンAPI仕様書 イベント通知編 Version 1.8.0」
 *   ＡＰＩ：振込入金口座_入金明細通知（x-eventType: va-deposit-transaction）
 *
 * 仕様書が定めるセキュリティ対策と、本実装の対応:
 *   1. アクセストークン（必須）… x-access-token ヘッダー。GMO_WEBHOOK_ACCESS_TOKEN と照合
 *   2. シグネチャ（任意）    … x-webhook-signature ヘッダー。
 *                              Base64( HMAC-SHA256( 生ボディ, クライアントシークレット ) )
 *                              GMO_WEBHOOK_SIGNING_SECRET（未設定なら GMO_CLIENT_SECRET）で検証
 *   3. Basic認証（任意）     … Authorization ヘッダー。GMO_WEBHOOK_USER / GMO_WEBHOOK_PASS
 *
 * 事務所の運用として上乗せしている対策:
 *   4. 送信元IP制限   … 配信元グローバルIPのみ受け付ける
 *                       （開発 18.182.233.135 / 本番 13.115.136.151）
 *                       GMO_WEBHOOK_ENFORCE_IP=0 で無効化できる
 *   5. 共通シークレット … GMO_WEBHOOK_SECRET を設定した場合のみ x-webhook-secret を必須にする
 *   6. フェイルクローズ … 1〜5 がどれも効いていない場合は全て拒否する
 *                       （設定漏れのまま誰でも入金実績を書き換えられる状態を作らない）
 *   7. 冪等性         … eventKey（明細キー itemKey / messageId、無ければ本文のSHA-256）で
 *                       ユニーク。仕様書に「重複配信される場合がある」と明記されているため必須
 *   8. 生ログ保全     … 反映可否によらず受信JSONを丸ごと gmo_webhook_events に保存する
 *                       （拒否した通信も記録するので、送信元IPの想定違いに気づける）
 *
 * 仕様書に明記されている運用上の注意（画面に出して気づけるようにすること）:
 *   ・アクセストークンが期限切れになると配信が止まり、その間の明細は再送されない
 *     → 振込入金口座入金明細照会API で取りに行く必要がある
 *   ・配信エラーが1時間続くと自動的に配信停止状態へ移行する → /subscribe で再開が必要
 *   ・配信停止のまま14日経過したメッセージは削除される（復旧不能）
 *   ・通知の順序は保証されない
 *   ・法人口座および個人事業主口座のみ対象（個人口座は対象外）
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from './db.js'
import { writeAudit, type Actor } from './audit.js'
import {
  planDepositRows,
  applyDepositPlan,
  parseSummary,
  toIsoDate,
  type DepositRow,
} from './depositImport.js'

/** GMO から通知された Webhook 配信元グローバルIP（開発 / 本番） */
const DEFAULT_ALLOW_IPS = ['18.182.233.135', '13.115.136.151']

/** 追加で許可するIP（カンマ区切り）。動作確認や中継を挟む場合に使う */
function allowedIps(): string[] {
  const extra = (process.env.GMO_WEBHOOK_ALLOW_IPS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...DEFAULT_ALLOW_IPS, ...extra]
}

/** IP制限を使うか。既定は有効。GMO側の配信元が変わった場合に 0 で外せる */
function ipCheckEnabled(): boolean {
  return process.env.GMO_WEBHOOK_ENFORCE_IP !== '0'
}

/** 長さの違いで内容を推測されないよう、ハッシュ同士を固定長で比較する */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/** Basic認証ヘッダーの検証。設定が無ければ null（未設定）を返す */
function checkBasicAuth(
  headers: Record<string, string | string[] | undefined>
): 'ok' | 'ng' | null {
  const user = process.env.GMO_WEBHOOK_USER ?? ''
  const pass = process.env.GMO_WEBHOOK_PASS ?? ''
  if (user === '' || pass === '') return null
  const raw = headers['authorization'] ?? headers['Authorization']
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v || !/^Basic\s+/i.test(v)) return 'ng'
  let decoded = ''
  try {
    decoded = Buffer.from(v.replace(/^Basic\s+/i, ''), 'base64').toString('utf8')
  } catch {
    return 'ng'
  }
  const i = decoded.indexOf(':')
  if (i < 0) return 'ng'
  const gotUser = decoded.slice(0, i)
  const gotPass = decoded.slice(i + 1)
  return safeEqual(gotUser, user) && safeEqual(gotPass, pass) ? 'ok' : 'ng'
}

/**
 * アクセストークンの検証（仕様書では必須ヘッダー x-access-token）。
 * GMO_WEBHOOK_ACCESS_TOKEN が未設定なら null（検証しない）を返す。
 */
function checkAccessToken(
  headers: Record<string, string | string[] | undefined>
): 'ok' | 'ng' | null {
  const expected = process.env.GMO_WEBHOOK_ACCESS_TOKEN ?? ''
  if (expected === '') return null
  const raw = headers['x-access-token'] ?? headers['X-Access-Token']
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v !== 'string' || v === '') return 'ng'
  return safeEqual(v, expected) ? 'ok' : 'ng'
}

/**
 * シグネチャの検証（仕様書のオプション機能）。
 *   x-webhook-signature = Base64( HMAC-SHA256( 生ボディ, クライアントシークレット ) )
 * 検証鍵は GMO_WEBHOOK_SIGNING_SECRET、無ければ GMO_CLIENT_SECRET を使う。
 * どちらも未設定なら null（検証しない）を返す。
 */
function checkSignature(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>
): 'ok' | 'ng' | null {
  const key = process.env.GMO_WEBHOOK_SIGNING_SECRET || process.env.GMO_CLIENT_SECRET || ''
  if (key === '') return null
  const raw = headers['x-webhook-signature'] ?? headers['X-Webhook-Signature']
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v !== 'string' || v === '') return 'ng'
  const expected = createHmac('sha256', key).update(rawBody, 'utf8').digest('base64')
  return safeEqual(v, expected) ? 'ok' : 'ng'
}

/** 仕様書のイベント種別。ヘッダー x-eventType に入る */
export const EVENT_TYPE_VA_DEPOSIT = 'va-deposit-transaction'

/** ヘッダーの値を1つ取り出す（配列で来る場合に備える） */
function headerOf(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const raw = headers[name] ?? headers[name.toLowerCase()]
  const v = Array.isArray(raw) ? raw[0] : raw
  return typeof v === 'string' && v !== '' ? v : null
}

/**
 * x-forwarded-for から実クライアントIPを取り出す。
 * Vercel は "client, proxy1, proxy2" の順で積むため先頭を採用する。
 */
export function clientIpOf(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers['x-forwarded-for'] ?? headers['X-Forwarded-For']
  const v = Array.isArray(raw) ? raw[0] : raw
  const first = (v ?? '').split(',')[0]?.trim()
  return first || null
}

export type WebhookResult = { status: number; body: Record<string, unknown> }

// ============================================================
// ペイロードからの明細抽出
// ------------------------------------------------------------
// 「GMOあおぞらネット銀行 オープンAPI仕様書 イベント通知編 v1.8.0」
// ＡＰＩ：振込入金口座_入金明細通知 のボディ定義に合わせて取り出す。
//
//   {
//     "messageId": "0000000000123456789",
//     "timestamp": "2018-11-09T17:59:59+09:00",
//     "account":       { raId, raBranchCode, raBranchNameKana,
//                        raAccountNumber, raHolderName, baseDate, baseTime },
//     "vaTransaction": { vaId, transactionDate, valueDate,
//                        vaBranchCode, vaBranchNameKana, vaAccountNumber,
//                        vaAccountNameKana, depositAmount, remitterNameKana,
//                        paymentBankName, paymentBranchName, partnerName,
//                        remarks, itemKey }
//   }
//
// 1通知＝1明細（vaTransaction はオブジェクト）。将来まとめて配信される場合に
// 備えて配列でも受けられるようにしてある。
// 仕様外の形で届いた場合は LEGACY_ALIASES によるゆるい探索へフォールバックし、
// それでも取れなければ status='unparsed' として生JSONを残す。
// ============================================================

/**
 * 仕様外の形で届いたときの保険。項目名の候補を並べて先に見つかったものを採用する。
 * 大文字小文字・アンダースコア・ハイフンは無視して比較する。
 */
const LEGACY_ALIASES = {
  /** 明細の配列が入っているキー */
  list: [
    'vaTransactions',
    'depositList',
    'deposits',
    'details',
    'detailList',
    'transactions',
    'items',
    'data',
    '明細',
  ],
  /** 明細ごとの一意ID（冪等キーに使う） */
  id: ['itemKey', 'messageId', 'transactionId', 'detailId', 'depositId', 'id', 'referenceNumber'],
  /** 入金日 */
  date: ['transactionDate', 'depositDate', 'valueDate', 'date', 'transferDate', '入金日'],
  /** 入金額 */
  amount: ['depositAmount', 'transferAmount', 'amount', 'value', '入金額'],
  /** 振込入金口座（V口座）の口座番号 */
  account: ['vaAccountNumber', 'accountNumber', 'virtualAccountNumber', 'accountNo', '口座番号'],
  /** 振込入金口座の支店名 */
  branch: ['vaBranchNameKana', 'branchName', 'virtualBranchName', 'branch', '支店名'],
  /** 支店コード（支店名が来ない場合の手がかり） */
  branchCode: ['vaBranchCode', 'branchCode', 'virtualBranchCode', '支店コード'],
  /** 振込依頼人名 */
  payer: ['remitterNameKana', 'remitterName', 'payerName', 'senderName', '振込依頼人名', '依頼人名'],
  /** 摘要（分解前の文字列が来る場合） */
  summary: ['remarks', 'summary', 'description', 'itemName', '摘要'],
} as const

const normKey = (k: string): string => k.replace(/[_\-\s]/g, '').toLowerCase()

/** オブジェクトから別名候補のいずれかに一致する値を取り出す */
function pick(obj: Record<string, unknown>, aliases: readonly string[]): unknown {
  const map = new Map<string, unknown>()
  for (const [k, v] of Object.entries(obj)) map.set(normKey(k), v)
  for (const a of aliases) {
    const v = map.get(normKey(a))
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

const asStr = (v: unknown): string | null =>
  v === undefined || v === null ? null : String(v).trim() || null

const asInt = (v: unknown): number | null => {
  if (v === undefined || v === null) return null
  const n = Number(String(v).replace(/[,\s円]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : null
}

/** ペイロードの中から「明細っぽい配列」を探す（入れ子1段まで） */
function findDetailArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload))
    return payload.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  if (!payload || typeof payload !== 'object') return []
  const obj = payload as Record<string, unknown>
  const direct = pick(obj, LEGACY_ALIASES.list)
  if (Array.isArray(direct)) {
    return direct.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  }
  // 素直に見つからない場合、オブジェクト値を1段だけ潜って探す
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.some((x) => x && typeof x === 'object')) {
      return v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
    }
    if (v && typeof v === 'object') {
      const nested = pick(v as Record<string, unknown>, LEGACY_ALIASES.list)
      if (Array.isArray(nested)) {
        return nested.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
      }
    }
  }
  // 明細1件がそのまま来る形（配列でない）にも備える
  if (asInt(pick(obj, LEGACY_ALIASES.amount)) != null) return [obj]
  return []
}

export type Extracted = { rows: DepositRow[]; ids: string[] }

/** 仕様書どおりの明細（vaTransaction 1件）から取込用の1行を作る */
function rowFromVaTransaction(t: Record<string, unknown>, rowNo: number): DepositRow | null {
  const date = toIsoDate(asStr(t['transactionDate']) ?? asStr(t['valueDate']) ?? '')
  const amount = asInt(t['depositAmount'])
  if (!date || amount == null || amount <= 0) return null
  return {
    rowNo,
    date,
    amount,
    accountNumber: asStr(t['vaAccountNumber']),
    // 支店は「ｱｼﾞｻｲ」のような半角カナで届く。DB 側は「あじさい支店」なので
    // 突合時に normalizeBranchName() で表記を揃える（depositImport.ts）。
    branch: asStr(t['vaBranchNameKana']) ?? asStr(t['vaBranchCode']),
    payerName: asStr(t['remitterNameKana']),
    rawSummary: asStr(t['remarks']),
  }
}

/**
 * 通知ペイロードを、CSV取込と同じ DepositRow[] に変換する。
 * まず仕様書どおりの形（vaTransaction）で読み、取れなければゆるい探索に落とす。
 * 日付・金額が取れない行は捨てる（後段の突合が成立しないため）。
 */
export function pickDeposits(payload: unknown): Extracted {
  const rows: DepositRow[] = []
  const ids: string[] = []

  // ── 1. 仕様書どおりの形 ──
  const notifications: Record<string, unknown>[] = Array.isArray(payload)
    ? (payload.filter((x) => x && typeof x === 'object') as Record<string, unknown>[])
    : payload && typeof payload === 'object'
      ? [payload as Record<string, unknown>]
      : []
  for (const n of notifications) {
    const raw = n['vaTransaction']
    const list = Array.isArray(raw)
      ? (raw.filter((x) => x && typeof x === 'object') as Record<string, unknown>[])
      : raw && typeof raw === 'object'
        ? [raw as Record<string, unknown>]
        : []
    for (const t of list) {
      const row = rowFromVaTransaction(t, rows.length + 1)
      if (!row) continue
      rows.push(row)
      // 明細キー（口座ID毎に一意）→ 無ければメッセージID を冪等キーに使う
      const id = asStr(t['itemKey']) ?? asStr(n['messageId'])
      if (id) ids.push(id)
    }
  }
  if (rows.length > 0) return { rows, ids }

  // ── 2. 仕様外の形（フォールバック）──
  return pickDepositsLoose(payload)
}

/** 項目名が仕様と違う形で届いた場合の保険 */
function pickDepositsLoose(payload: unknown): Extracted {
  const details = findDetailArray(payload)
  const rows: DepositRow[] = []
  const ids: string[] = []
  details.forEach((d, i) => {
    const date = toIsoDate(asStr(pick(d, LEGACY_ALIASES.date)) ?? '')
    const amount = asInt(pick(d, LEGACY_ALIASES.amount))
    if (!date || amount == null || amount <= 0) return

    let account = asStr(pick(d, LEGACY_ALIASES.account))
    let branch = asStr(pick(d, LEGACY_ALIASES.branch)) ?? asStr(pick(d, LEGACY_ALIASES.branchCode))
    let payer = asStr(pick(d, LEGACY_ALIASES.payer))
    const summary = asStr(pick(d, LEGACY_ALIASES.summary))

    // 口座番号や支店が個別項目で来ず、摘要にまとまっている形にも対応する
    // （CSV取込と同じ「振込 ◯◯ ◯◯支店 1234567」の分解を通す）
    if (summary && (!account || !branch || !payer)) {
      const p = parseSummary(summary)
      account = account ?? p.accountNumber
      branch = branch ?? p.branch
      payer = payer ?? p.payerName
    }

    rows.push({
      rowNo: i + 1,
      date,
      amount,
      accountNumber: account,
      branch,
      payerName: payer,
      rawSummary: summary ?? null,
    })
    const id = asStr(pick(d, LEGACY_ALIASES.id))
    if (id) ids.push(id)
  })
  return { rows, ids }
}

/**
 * 通知全体の一意キー。
 * 仕様書の「明細キー（itemKey）」または「メッセージID（messageId）」が取れれば
 * それを連結し、取れなければ本文のハッシュを使う。
 * 仕様書に「同一のメッセージが重複して配信される場合があります」と明記されているため、
 * このキーによる二重反映の防止は必須。
 */
function buildEventKey(rawBody: string, ids: string[]): string {
  if (ids.length > 0) return 'ids:' + ids.join(',').slice(0, 200)
  return 'sha256:' + createHash('sha256').update(rawBody).digest('hex')
}

/** Webhook 実行時の監査アクター（人ではないので固定値） */
const WEBHOOK_ACTOR: Actor = { email: 'gmo-webhook' }

/**
 * Webhook 本体。
 * GMO 側は 2xx 以外だと再送してくるため、こちらの都合による失敗（未対応の
 * ペイロード等）では 200 を返し、記録だけ残して人が対応する方針にする。
 * 拒否すべきもの（送信元IP不正・シークレット不一致）だけ 401/403 を返す。
 */
export async function handleGmoWebhook(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>
): Promise<WebhookResult> {
  const ip = clientIpOf(headers)

  // ── 1. アクセストークン（仕様書の必須ヘッダー x-access-token）──
  const token = checkAccessToken(headers)
  if (token === 'ng') {
    await recordRejection(rawBody, ip, 'x-access-token が一致しません')
    return { status: 401, body: { error: 'unauthorized', reason: 'access token mismatch' } }
  }

  // ── 2. シグネチャ（仕様書のオプション機能 x-webhook-signature）──
  const signature = checkSignature(rawBody, headers)
  if (signature === 'ng') {
    await recordRejection(rawBody, ip, 'x-webhook-signature の検証に失敗しました')
    return { status: 401, body: { error: 'unauthorized', reason: 'signature mismatch' } }
  }

  // ── 3. Basic認証（GMOのイベント通知設定に登録した資格情報）──
  const basic = checkBasicAuth(headers)
  if (basic === 'ng') {
    await recordRejection(rawBody, ip, 'Basic認証に失敗しました')
    return {
      status: 401,
      body: { error: 'unauthorized', reason: 'basic auth failed' },
    }
  }

  // ── 4. 共通シークレット（設定時のみ必須）──
  const expected = process.env.GMO_WEBHOOK_SECRET ?? ''
  const secretUsed = expected !== ''
  if (secretUsed) {
    const got = headers['x-webhook-secret'] ?? headers['X-Webhook-Secret']
    const val = Array.isArray(got) ? got[0] : got
    if (typeof val !== 'string' || !safeEqual(val, expected)) {
      await recordRejection(rawBody, ip, '共通シークレットが一致しません')
      return { status: 401, body: { error: 'unauthorized', reason: 'secret mismatch' } }
    }
  }

  // ── 5. 送信元IP制限 ──
  const ipUsed = ipCheckEnabled()
  if (ipUsed && (!ip || !allowedIps().includes(ip))) {
    // 想定と違うIPから届いていること自体が調査の手がかりになるので記録する
    await recordRejection(rawBody, ip, `許可されていない送信元IPです（${ip ?? '不明'}）`)
    return { status: 403, body: { error: 'forbidden', reason: 'source ip not allowed' } }
  }

  // ── 6. フェイルクローズ ──
  // アクセストークン・シグネチャ・Basic認証・共通シークレット・IP制限のどれも
  // 効いていない状態は、誰でも入金実績を書き換えられることを意味するため受け付けない。
  if (token === null && signature === null && basic === null && !secretUsed && !ipUsed) {
    return {
      status: 503,
      body: {
        error: 'not-configured',
        reason:
          'GMO_WEBHOOK_ACCESS_TOKEN（推奨）または GMO_WEBHOOK_USER / GMO_WEBHOOK_PASS が未設定です。設定するまで受信しません',
      },
    }
  }

  // ── 7. JSON パース ──
  let payload: unknown
  try {
    payload = JSON.parse(rawBody || '{}')
  } catch {
    // 壊れたJSONは再送されても直らないので 200 で受け切り、記録だけ残す
    await saveEvent({
      eventKey: 'sha256:' + createHash('sha256').update(rawBody).digest('hex'),
      eventType: null,
      sourceIp: ip,
      payload: { _raw: rawBody.slice(0, 4000) },
      status: 'unparsed',
      parsedRows: 0,
      reflected: 0,
      message: 'JSONとして解釈できない本文を受信しました',
    })
    return { status: 200, body: { ok: true, stored: true, parsed: false } }
  }

  const { rows, ids } = pickDeposits(payload)
  const eventKey = buildEventKey(rawBody, ids)
  // イベント種別は仕様書どおりヘッダー（x-eventType）から取る。
  // 届かない場合に備えて本文側も見る。
  const eventType =
    headerOf(headers, 'x-eventType') ??
    (payload && typeof payload === 'object'
      ? asStr(pick(payload as Record<string, unknown>, ['eventType', 'notificationType', 'type']))
      : null)

  // ── 8. 冪等性チェック（同じ通知の再送は何もしない）──
  const existing = await prisma.gmoWebhookEvent.findUnique({ where: { eventKey } })
  if (existing) {
    return {
      status: 200,
      body: { ok: true, duplicate: true, eventId: existing.id, status: existing.status },
    }
  }

  // ── 9. 明細が取れなければ生ログだけ残す ──
  if (rows.length === 0) {
    const ev = await saveEvent({
      eventKey,
      eventType,
      sourceIp: ip,
      payload: payload as object,
      status: 'unparsed',
      parsedRows: 0,
      reflected: 0,
      message:
        '入金明細を取り出せませんでした（項目名が想定と異なる可能性があります）。生データを保存したので、仕様書の項目名に合わせて再処理してください',
    })
    return { status: 200, body: { ok: true, stored: true, parsed: false, eventId: ev.id } }
  }

  // ── 10. CSV取込と同じ判定・反映 ──
  try {
    const plan = await planDepositRows(rows, 'json')
    const result = await applyDepositPlan(WEBHOOK_ACTOR, plan, 'gmo-webhook')
    const status =
      result.reflected > 0 ? 'applied' : plan.unmatchedCount > 0 ? 'no-target' : 'no-target'
    const ev = await saveEvent({
      eventKey,
      eventType,
      sourceIp: ip,
      payload: payload as object,
      status,
      parsedRows: rows.length,
      reflected: result.reflected,
      message: `明細${rows.length}件 / 反映${result.reflected}件・補充行${result.supplements}件・スキップ${result.skipped}件・未突合${result.unmatched}件・エラー${result.errors}件`,
    })
    return {
      status: 200,
      body: { ok: true, eventId: ev.id, reflected: result.reflected, rows: rows.length },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const ev = await saveEvent({
      eventKey,
      eventType,
      sourceIp: ip,
      payload: payload as object,
      status: 'failed',
      parsedRows: rows.length,
      reflected: 0,
      message: `反映処理でエラー: ${msg}`,
    })
    // 200 を返す（再送されても同じ理由で失敗するため。画面で気づけるようにする）
    return { status: 200, body: { ok: false, eventId: ev.id, error: msg } }
  }
}

/**
 * 認証で弾いた通信の記録。
 * 何も残さないと「通知が来ていないのか、弾いているのか」が切り分けられないため、
 * 本文は先頭のみ・ハッシュキーで重複を潰して保存する。
 */
async function recordRejection(rawBody: string, ip: string | null, reason: string) {
  const key =
    'rejected:' + createHash('sha256').update(`${ip ?? ''}|${rawBody}`).digest('hex').slice(0, 32)
  try {
    const dup = await prisma.gmoWebhookEvent.findUnique({ where: { eventKey: key } })
    if (dup) return
    await saveEvent({
      eventKey: key,
      eventType: null,
      sourceIp: ip,
      payload: { _raw: rawBody.slice(0, 2000) },
      status: 'rejected',
      parsedRows: 0,
      reflected: 0,
      message: reason,
    })
  } catch {
    /* 記録に失敗しても受信処理の判定は変えない */
  }
}

async function saveEvent(data: {
  eventKey: string
  eventType: string | null
  sourceIp: string | null
  payload: object
  status: string
  parsedRows: number
  reflected: number
  message: string
}) {
  return await prisma.gmoWebhookEvent.create({
    data: {
      eventKey: data.eventKey,
      eventType: data.eventType,
      sourceIp: data.sourceIp,
      payload: data.payload as never,
      status: data.status,
      parsedRows: data.parsedRows,
      reflected: data.reflected,
      message: data.message,
      processedAt: new Date(),
    },
  })
}

export type WebhookEventRow = {
  id: number
  eventKey: string
  eventType: string | null
  sourceIp: string | null
  status: string
  parsedRows: number
  reflected: number
  message: string | null
  receivedAt: string
}

/** 画面表示用：直近の受信履歴 */
export async function listWebhookEvents(limit = 50): Promise<{
  rows: WebhookEventRow[]
  counts: {
    total: number
    applied: number
    unparsed: number
    failed: number
    noTarget: number
    rejected: number
  }
}> {
  const [rows, total, applied, unparsed, failed, noTarget, rejected] = await Promise.all([
    prisma.gmoWebhookEvent.findMany({
      orderBy: { receivedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        eventKey: true,
        eventType: true,
        sourceIp: true,
        status: true,
        parsedRows: true,
        reflected: true,
        message: true,
        receivedAt: true,
      },
    }),
    prisma.gmoWebhookEvent.count(),
    prisma.gmoWebhookEvent.count({ where: { status: 'applied' } }),
    prisma.gmoWebhookEvent.count({ where: { status: 'unparsed' } }),
    prisma.gmoWebhookEvent.count({ where: { status: 'failed' } }),
    prisma.gmoWebhookEvent.count({ where: { status: 'no-target' } }),
    prisma.gmoWebhookEvent.count({ where: { status: 'rejected' } }),
  ])
  return {
    rows: rows.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() })),
    counts: { total, applied, unparsed, failed, noTarget, rejected },
  }
}

/**
 * 保存済みの通知を再処理する（仕様書受領後に項目名を直したときや、
 * 未突合だった案件のV口座を登録し直したあとに使う）。
 */
export async function reprocessWebhookEvent(
  actor: Actor,
  id: number
): Promise<{ ok: boolean; reflected: number; message: string }> {
  const ev = await prisma.gmoWebhookEvent.findUnique({ where: { id } })
  if (!ev) return { ok: false, reflected: 0, message: '対象の通知が見つかりません' }
  const { rows } = pickDeposits(ev.payload)
  if (rows.length === 0) {
    return { ok: false, reflected: 0, message: '入金明細を取り出せませんでした' }
  }
  const plan = await planDepositRows(rows, 'json')
  const result = await applyDepositPlan(actor, plan, 'gmo-webhook')
  const message = `明細${rows.length}件 / 反映${result.reflected}件・未突合${result.unmatched}件`
  await prisma.gmoWebhookEvent.update({
    where: { id },
    data: {
      status: result.reflected > 0 ? 'applied' : 'no-target',
      parsedRows: rows.length,
      reflected: ev.reflected + result.reflected,
      message: `再処理: ${message}`,
      processedAt: new Date(),
    },
  })
  await writeAudit({
    actor,
    action: 'UPDATE',
    entity: 'Payment',
    summary: `GMO入金通知の再処理（#${id}）: ${message}`,
    metadata: { source: 'gmo-webhook-reprocess', eventId: id },
  })
  return { ok: true, reflected: result.reflected, message }
}
