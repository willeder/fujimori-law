/**
 * 債権者名の候補（DB全体の既存債権者名・重複なし）を取得するフック。
 * ドロップダウン選択（SuggestInput）用。取得は1回だけ（モジュール内キャッシュ）。
 * 使用箇所: 和解実績一覧の絞込・検索モードの債権者列・各社タブの債権者編集 など。
 */
import { useEffect, useState } from 'react'

let cache: string[] | null = null

export function useCreditorNames(): string[] {
  const [names, setNames] = useState<string[]>(() => cache ?? [])
  useEffect(() => {
    if (cache) return
    let alive = true
    fetch('/api/creditors/names')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { names?: string[] } | null) => {
        const list = [...new Set(d?.names ?? [])]
        cache = list
        if (alive) setNames(list)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return names
}
