/**
 * 金融機関コード・支店コードの入力補助（修正依頼⑯）。
 *
 * 事務所からのご要望:
 *   「振込先情報登録の際、銀行の名前を入れたら金融機関コードが表示されるように」
 *
 * 辞書は npm の zengin-code（全銀の公開データ・MIT）。1,146金融機関 / 28,931支店。
 * **サーバ側でだけ読む**。約5MBあり、画面側に持たせるとブラウザが重くなる。
 * 外部サービスへは問い合わせないので、依頼者の情報が外に出ることはない。
 *
 * 【表記ゆれの吸収について】
 * 辞書側の名前は略記です（「みずほ」「京都信金」「農林中金」）。一方いま登録されている
 * データは正式名称（「みずほ銀行」「茨城県信用組合」「農林中央金庫」）で入っています。
 * そこで両側に同じ正規化をかけてから突き合わせます。
 *
 * 実データ（creditors 8,641件の実値）で検証した結果:
 *   銀行名  67/73 が完全一致
 *     不一致6件の内訳 … 三菱UFJニコス・三井住友カード（カード会社名を銀行名欄に記入）
 *                        三菱FFJ銀行（誤字）、三井住友銀行にコード0005（コード誤り）
 *                        八十二銀行・青森銀行（2025年の合併前の旧行名。辞書は
 *                        「八十二長野」「青森みちのく」。前方一致で候補には出ます）
 *   支店名  256/260 が完全一致
 *     不一致4件の内訳 … 矢田部/谷田部・きらさぎ/きさらぎ（誤字）、
 *                        高知銀行「本店」/辞書「本店営業部」（前方一致で候補に出ます）、
 *                        三菱UFJ 763 を「中央支店」と記載（辞書は「王子駅前」）
 */
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)

type RawBranch = { code: string; name: string; kana?: string }
type RawBank = {
  code: string
  name: string
  kana?: string
  branches: Record<string, RawBranch>
}

let BANKS: Record<string, RawBank> | null = null

/** 辞書は初回に1度だけ読む。読めない場合（未インストール等）は機能を無効にする */
function load(): boolean {
  if (BANKS) return true
  try {
    BANKS = require_('zengin-code') as Record<string, RawBank>
    return true
  } catch {
    return false
  }
}

export function bankCodeConfigured(): boolean {
  return load()
}

export type BankHit = { code: string; name: string; kana: string }
export type BranchHit = { code: string; name: string; kana: string }

/** 正式名称 → 辞書の略記。辞書側・入力側の両方に同じ変換をかける */
const TYPE_ALIAS: Array<[RegExp, string]> = [
  [/信用金庫/g, '信金'],
  [/信用組合/g, '信組'],
  [/信用農業協同組合連合会|信農連/g, '信連'],
  [/信用漁業協同組合連合会/g, '信漁連'],
  [/農業協同組合/g, '農協'],
  [/漁業協同組合/g, '漁協'],
  [/労働金庫/g, '労金'],
  [/中央金庫/g, '中金'],
]

/**
 * 共通の下ごしらえ。
 *   NFKC … 全角英数字「三菱ＵＦＪ」と半角「三菱UFJ」、半角カナ「ｳｶﾙ」を揃える
 *   ひらがな→カタカナ … 「きざし支店」と「キザシ支店」を揃える
 *   空白・中黒・長音・ハイフンは落とす
 */
function base(v: string): string {
  let t = String(v ?? '')
    .normalize('NFKC')
    .toLowerCase()
  t = t.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
  return t.replace(/[\s・ー-]/g, '')
}

/** 金融機関名の正規化。「株式会社」と末尾の「銀行」は辞書側に無いので落とす */
function normBank(v: string): string {
  let t = String(v ?? '')
    .normalize('NFKC')
    .toLowerCase()
  t = t.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
  t = t.replace(/株式会社|\(株\)/g, '')
  for (const [re, to] of TYPE_ALIAS) t = t.replace(re, to)
  t = t.replace(/銀行$/, '')
  return t.replace(/[\s・ー-]/g, '')
}

/** 支店名の正規化。辞書は「丸の内中央」のように「支店」を付けない */
function normBranch(v: string): string {
  return base(v).replace(/(支店|支所|出張所)+$/, '')
}

/** 辞書側の名前の末尾に付く業態（銀行には付かない） */
const TYPE_SUFFIX = /(信金|信組|信連|信漁連|農協|漁協|労金)$/

type Scored<T> = { x: T; score: number; penalty: number }

/**
 * 完全一致 → 前方一致 → 部分一致 の順。
 *
 * 同じ順位のときは
 *   1. 業態のずれが無いほうを上に
 *      「青森銀行」と打ったのに「青森農協」が先に出る、というのを防ぐ。
 *      入力に業態が書かれていない（または「銀行」）なら、業態の付く行を後ろに送る。
 *   2. 名前の短い順（「みずほ」を「みずほ信託」より上に）
 */
function rank<T extends { name: string; kana: string }>(
  items: T[],
  q: string,
  norm: (v: string) => string,
  wantsBank = false,
): T[] {
  const nq = norm(q)
  if (!nq) return []
  const scored: Array<Scored<T>> = []
  for (const x of items) {
    const n = norm(x.name)
    const k = base(x.kana)
    let score = -1
    if (n === nq || k === nq) score = 0
    else if (n.startsWith(nq) || k.startsWith(nq)) score = 1
    else if (n.includes(nq) || k.includes(nq)) score = 2
    if (score < 0) continue
    const penalty = wantsBank && TYPE_SUFFIX.test(x.name) ? 1 : 0
    scored.push({ x, score, penalty })
  }
  scored.sort(
    (a, b) => a.score - b.score || a.penalty - b.penalty || a.x.name.length - b.x.name.length,
  )
  return scored.map((s) => s.x)
}

function bankList(): BankHit[] {
  return Object.values(BANKS ?? {}).map((b) => ({
    code: b.code,
    name: b.name,
    kana: b.kana ?? '',
  }))
}

/** 金融機関コードを4桁に整える（「9」→「0009」のような入力も受ける） */
function fixBankCode(code: string): string {
  const d = String(code ?? '').replace(/[^0-9]/g, '')
  return d ? d.padStart(4, '0') : ''
}

/** 支店コードを3桁に整える */
function fixBranchCode(code: string): string {
  const d = String(code ?? '').replace(/[^0-9]/g, '')
  return d ? d.padStart(3, '0') : ''
}

/**
 * 銀行名（またはカナ）から候補を返す。
 * 4桁の数字だけが入力されたときはコードとして引く（コードから名前を出したい場合）。
 */
export function searchBanks(q: string, limit = 20): BankHit[] {
  if (!load()) return []
  const raw = String(q ?? '').trim()
  if (!raw) return []
  if (/^[0-9]{4}$/.test(raw)) {
    const hit = bankByCode(raw)
    return hit ? [hit] : []
  }
  // 入力に信金・信組・農協などが書かれていなければ「銀行を探している」とみなす
  const wantsBank = !TYPE_SUFFIX.test(normBank(raw))
  return rank(bankList(), raw, normBank, wantsBank).slice(0, limit)
}

/** 略記 → 正式名称（TYPE_ALIAS の逆向き。候補の表示に使う） */
const TYPE_UNALIAS: Array<[RegExp, string]> = [
  [/信金$/, '信用金庫'],
  [/信組$/, '信用組合'],
  [/農協$/, '農業協同組合'],
  [/漁協$/, '漁業協同組合'],
  [/労金$/, '労働金庫'],
  [/中金$/, '中央金庫'],
]

/** 全角の英数字を半角へ（「三菱ＵＦＪ」→「三菱UFJ」）。事務所の入力は半角のため */
function toHalfWidth(s: string): string {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  )
}

/**
 * 辞書の名前を、事務所が実際に入力している表記に合わせる。
 *
 * 辞書（zengin-code）は「三井住友」「尼崎信金」「三菱ＵＦＪ」のように、
 * 業態語が略され英数字が全角の表記で、登録済みの実データ（「三井住友銀行」
 * 「尼崎信用金庫」「三菱UFJ銀行」）とは一致しない。そのまま候補に出すと打っても
 * 引っかからず、選ぶと登録済みの名前が別表記に変わってしまう。
 *   ・業態語が付いていない＝銀行なので「銀行」を補う
 *   ・信金・信組などの略記は正式名称に戻す
 *   ・全角の英数字は半角にする
 * 登録済みの銀行名72種類で照合して決めた変換。
 */
function displayBankName(name: string): string {
  const half = toHalfWidth(name)
  for (const [re, full] of TYPE_UNALIAS) {
    if (re.test(half)) return half.replace(re, full)
  }
  return TYPE_SUFFIX.test(half) ? half : `${half}銀行`
}

/**
 * 全金融機関（1,146件）を返す。
 * 銀行名の欄で「打ちながら候補を出す」ために、画面側で一度だけ読み込んで持つ。
 * 打鍵のたびにサーバへ問い合わせない作りにするため。
 */
export function allBanks(): BankHit[] {
  if (!load()) return []
  return bankList()
    .map((b) => ({ ...b, name: displayBankName(b.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

/** ある金融機関の全支店を返す（支店名の候補用。銀行が決まってから読み込む） */
export function allBranches(bankCode: string): BranchHit[] {
  if (!load()) return []
  const b = BANKS?.[fixBankCode(bankCode)]
  if (!b) return []
  return Object.values(b.branches ?? {})
    .map((x) => ({ code: x.code, name: x.name, kana: x.kana ?? '' }))
    .sort((a, b2) => a.name.localeCompare(b2.name, 'ja'))
}

/** 金融機関コードから1件だけ引く */
export function bankByCode(code: string): BankHit | null {
  if (!load()) return null
  const b = BANKS?.[fixBankCode(code)]
  return b ? { code: b.code, name: b.name, kana: b.kana ?? '' } : null
}

/**
 * 支店名から候補を返す。
 * 銀行が特定できていないと支店は絞れないため、金融機関コードは必須にする。
 * （同じ支店名が別の銀行に大量にあるので、銀行なしで出すと選び間違える）
 * 検索語が空のときは、その銀行の支店を先頭から返す（一覧から選びたい場合）。
 */
export function searchBranches(bankCode: string, q: string, limit = 20): BranchHit[] {
  if (!load()) return []
  const b = BANKS?.[fixBankCode(bankCode)]
  if (!b) return []
  const all: BranchHit[] = Object.values(b.branches ?? {}).map((x) => ({
    code: x.code,
    name: x.name,
    kana: x.kana ?? '',
  }))
  const raw = String(q ?? '').trim()
  if (!raw) return all.slice(0, limit)
  if (/^[0-9]{3}$/.test(raw)) {
    const hit = branchByCode(bankCode, raw)
    return hit ? [hit] : []
  }
  return rank(all, raw, normBranch).slice(0, limit)
}

/** 金融機関コード＋支店コードから1件だけ引く */
export function branchByCode(bankCode: string, branchCode: string): BranchHit | null {
  if (!load()) return null
  const x = BANKS?.[fixBankCode(bankCode)]?.branches?.[fixBranchCode(branchCode)]
  return x ? { code: x.code, name: x.name, kana: x.kana ?? '' } : null
}
