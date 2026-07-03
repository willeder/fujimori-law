import { useEffect, useState } from 'react'

/**
 * useState と同じ使い勝手で、値を sessionStorage に保持するフック。
 * 一覧の絞り込み条件・ソート等を、詳細画面へ遷移して戻っても復元するために使う。
 * （タブ/ウィンドウ単位で保持。ブラウザを閉じると消える）
 *
 * @param key   sessionStorage のキー（画面ごとに一意に。例: "caseList.search"）
 * @param initial 初期値
 */
export function useSessionState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw != null ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state))
    } catch {
      /* 保存失敗は無視（プライベートモード等） */
    }
  }, [key, state])

  return [state, setState] as const
}
