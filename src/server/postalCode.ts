/**
 * 郵便番号の入力補助。
 *
 * 事務所からのご要望:
 *   「郵便番号は運用上も入れてほしい」
 * 実データでは kintone 側でも 363/3,110件（11.7%）しか入っていない。
 * 取込の不具合ではなく入力の手間で埋まっていないため、打つ手間を減らす方向で対応する。
 * （既存分の一括補完はしない方針。番地・建物名込みの住所から機械的に引くと
 *   取り違えが混ざるため、人が確認して入れる形にする）
 *
 * 2方向を用意する:
 *   郵便番号 → 住所     … 郵便番号を入れると 都道府県＋市区町村＋町域 が返る
 *   住所     → 郵便番号 … 住所から候補を返す（確定はさせず、人が選ぶ）
 *
 * 辞書は npm の jp-zipcode-lookup に同梱された日本郵便の公開データ（MIT）。
 * **サーバ側でだけ読む**。約3MBあり、画面側に持たせるとブラウザが重くなる。
 * 外部サービスへ問い合わせないので、依頼者の情報が外に出ることはない。
 *
 * ★ データ形式（実データで検証済み）
 *   zip5.json … 郵便番号の上5桁 → 市区町村コード
 *   zip7.json … 郵便番号7桁 → 町域名（文字列）
 *               ただし上5桁から引ける市区町村と違う場合だけ [市区町村コード, 町域名]
 *   city.json / pref.json … コード → [名称, カナ]
 *   検証: 8150082→福岡県福岡市南区大楠 / 1040061→東京都中央区銀座 /
 *         9240865→石川県白山市倉光 / 8180138→福岡県太宰府市吉松 /
 *         6018126→京都府京都市南区上鳥羽南花名町（いずれも実データの住所と一致）
 */
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)

type NameKana = [string, string]
let PREF: Record<string, NameKana> | null = null
let CITY: Record<string, NameKana> | null = null
let ZIP5: Record<string, number | string> | null = null
let ZIP7: Record<string, string | [number, string]> | null = null

/** 辞書は初回に1度だけ読む。読めない場合（未インストール等）は機能を無効にする */
function load(): boolean {
  if (ZIP7) return true
  try {
    const base = 'jp-zipcode-lookup/master/'
    PREF = require_(base + 'pref.json').pref
    CITY = require_(base + 'city.json').city
    ZIP5 = require_(base + 'zip5.json').zip5
    ZIP7 = require_(base + 'zip7.json').zip7
    return true
  } catch {
    return false
  }
}

export function postalConfigured(): boolean {
  return load()
}

export type PostalHit = {
  zipcode: string
  prefecture: string
  city: string
  town: string
  /** 都道府県＋市区町村＋町域 をつないだもの */
  address: string
}

/** 郵便番号の表記ゆれを数字7桁に揃える（全角・ハイフン・〒を落とす） */
export function normalizeZip(v: string): string {
  return String(v ?? '')
    .normalize('NFKC')
    .replace(/[^0-9]/g, '')
    .slice(0, 7)
}

/** 市区町村コード（5桁）から 都道府県名 を引く。先頭2桁が都道府県コード */
function prefOf(cityCode: string): string {
  const p = PREF?.[String(Number(cityCode.slice(0, 2)))]
  return p ? p[0] : ''
}

function hitOf(zip: string): PostalHit | null {
  const v = ZIP7?.[zip]
  if (v === undefined) return null
  const town = Array.isArray(v) ? v[1] : v
  const cityCode = Array.isArray(v) ? String(v[0]) : String(ZIP5?.[zip.slice(0, 5)] ?? '')
  const c = CITY?.[cityCode]
  if (!c) return null
  const prefecture = prefOf(cityCode)
  const city = c[0]
  return { zipcode: zip, prefecture, city, town, address: `${prefecture}${city}${town}` }
}

/** 郵便番号 → 住所 */
export function lookupByZip(rawZip: string): PostalHit[] {
  if (!load()) return []
  const zip = normalizeZip(rawZip)
  if (zip.length !== 7) return []
  const hit = hitOf(zip)
  return hit ? [hit] : []
}

/**
 * 住所照合用の正規化。
 * 番地・丁目・建物名は落として「町域まで」で見る。
 * 例) 「福岡県 福岡市南区 大楠3-5-19ピュアドーム」→「福岡県福岡市南区大楠」
 */
function normalizeAddress(v: string): string {
  let t = String(v ?? '').normalize('NFKC')
  t = t.replace(/[0-9].*$/, '')
  t = t.replace(/[一二三四五六七八九十]+丁目.*$/, '')
  t = t.replace(/[\s-]/g, '')
  return t
}

/**
 * 住所 → 郵便番号。**候補を返すだけで確定はしない。**
 * 似た町名で別の郵便番号が入る事故を避けるため、選ぶのは人に任せる。
 *
 * 逆引きの索引（約11.7万件）は初回に1度だけ作り、以後は使い回す。
 */
let reverseIndex: Map<string, string[]> | null = null

function buildReverseIndex(): Map<string, string[]> {
  if (reverseIndex) return reverseIndex
  const idx = new Map<string, string[]>()
  for (const zip of Object.keys(ZIP7 ?? {})) {
    const hit = hitOf(zip)
    if (!hit) continue
    const key = normalizeAddress(hit.address)
    if (!key) continue
    const arr = idx.get(key)
    if (arr) arr.push(zip)
    else idx.set(key, [zip])
  }
  reverseIndex = idx
  return idx
}

export function lookupByAddress(address: string): PostalHit[] {
  if (!load()) return []
  const target = normalizeAddress(address)
  if (target.length < 4) return []
  const idx = buildReverseIndex()

  // まず完全一致。無ければ「住所の先頭に一致する最も長い町域」を探す。
  const exact = idx.get(target)
  if (exact) {
    return exact.map((z) => hitOf(z)).filter((h): h is PostalHit => h != null)
  }

  const hits: PostalHit[] = []
  for (const [key, zips] of idx) {
    if (key.length < 4 || !target.startsWith(key)) continue
    for (const z of zips) {
      const h = hitOf(z)
      if (h) hits.push(h)
    }
  }
  // 町域まで長く一致したものほど確からしいので、その順に並べる
  hits.sort((a, b) => normalizeAddress(b.address).length - normalizeAddress(a.address).length)
  return hits.slice(0, 10)
}
