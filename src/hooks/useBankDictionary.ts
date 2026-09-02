/**
 * 金融機関・支店の辞書（全銀協の公開データ）を画面側に読み込む。
 *
 * 事務所からのご要望（藤川様 2026-08-22）:
 *   「ボタンではなく直接予測が出る方針にしたい」
 * 銀行名を打ちながら候補を出すため、辞書を一度だけ読み込んで持っておく。
 * 打鍵のたびにサーバへ問い合わせないので、候補は待ち時間なしで出る。
 *
 * 金融機関は1,146件で軽いのでセッション中に一度だけ。
 * 支店は全体で28,931件と多いため、金融機関が決まってからその銀行のぶんだけ読む。
 */
import { useEffect, useState } from 'react'

export type BankHit = { code: string; name: string; kana: string }

// 画面をまたいで使い回す（開くたびに読み直さない）
let bankCache: BankHit[] | null = null
let bankLoading: Promise<BankHit[]> | null = null
const branchCache = new Map<string, BankHit[]>()

async function fetchJson(url: string): Promise<BankHit[]> {
  try {
    const r = await fetch(url)
    if (!r.ok) return []
    const d = (await r.json()) as { hits?: BankHit[] }
    return d.hits ?? []
  } catch {
    return []
  }
}

/** 全金融機関。名前→コードの引き当てにも使う */
export function useBanks(): { banks: BankHit[]; byName: Map<string, BankHit> } {
  const [banks, setBanks] = useState<BankHit[]>(() => bankCache ?? [])

  useEffect(() => {
    if (bankCache) return
    let alive = true
    bankLoading ??= fetchJson('/api/bank/banks').then((hits) => {
      bankCache = hits
      return hits
    })
    void bankLoading.then((hits) => {
      if (alive) setBanks(hits)
    })
    return () => {
      alive = false
    }
  }, [])

  const byName = new Map<string, BankHit>()
  for (const b of banks) if (!byName.has(b.name)) byName.set(b.name, b)
  return { banks, byName }
}

/** ある金融機関の全支店。金融機関コードが空のときは何も読まない */
export function useBranches(bankCode: string | null | undefined): {
  branches: BankHit[]
  byName: Map<string, BankHit>
} {
  const code = (bankCode ?? '').trim()
  const [branches, setBranches] = useState<BankHit[]>(
    () => (code ? (branchCache.get(code) ?? []) : [])
  )

  useEffect(() => {
    if (!code) {
      setBranches([])
      return
    }
    const cached = branchCache.get(code)
    if (cached) {
      setBranches(cached)
      return
    }
    let alive = true
    void fetchJson(`/api/bank/branch-list?code=${encodeURIComponent(code)}`).then((hits) => {
      branchCache.set(code, hits)
      if (alive) setBranches(hits)
    })
    return () => {
      alive = false
    }
  }, [code])

  const byName = new Map<string, BankHit>()
  for (const b of branches) if (!byName.has(b.name)) byName.set(b.name, b)
  return { branches, byName }
}
