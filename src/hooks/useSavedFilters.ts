/**
 * 保存した絞り込み条件（共有フィルタ）の取得・作成・更新・削除。
 * 一覧は「全体共有すべて ＋ 自分の個人用」がサーバ側で絞られて返る。
 */
import { useCallback, useEffect, useState } from 'react'
import type { SavedFilter, SavedFilterInput } from '../types/savedFilter'
import { SAVED_FILTER_TARGET_CASE_LIST } from '../types/savedFilter'

type Result = { ok: boolean; error?: string; filter?: SavedFilter }

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    return data.error ?? `エラーが発生しました（${res.status}）`
  } catch {
    return `エラーが発生しました（${res.status}）`
  }
}

export function useSavedFilters(target: string = SAVED_FILTER_TARGET_CASE_LIST) {
  const [filters, setFilters] = useState<SavedFilter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/saved-filters?target=${encodeURIComponent(target)}`)
      if (!res.ok) {
        setError(await readError(res))
        setFilters([])
        return
      }
      setFilters((await res.json()) as SavedFilter[])
      setError(null)
    } catch {
      setError('通信エラーが発生しました')
      setFilters([])
    } finally {
      setLoading(false)
    }
  }, [target])

  useEffect(() => {
    // 初回マウント時とキー変更時に取得する（AuthContext と同じ扱い）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  const create = useCallback(
    async (input: SavedFilterInput): Promise<Result> => {
      try {
        const res = await fetch('/api/saved-filters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target, ...input }),
        })
        if (!res.ok) return { ok: false, error: await readError(res) }
        const filter = (await res.json()) as SavedFilter
        await reload()
        return { ok: true, filter }
      } catch {
        return { ok: false, error: '通信エラーが発生しました' }
      }
    },
    [target, reload]
  )

  const update = useCallback(
    async (id: string, input: Partial<SavedFilterInput>): Promise<Result> => {
      try {
        const res = await fetch(`/api/saved-filters/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
        if (!res.ok) return { ok: false, error: await readError(res) }
        const filter = (await res.json()) as SavedFilter
        await reload()
        return { ok: true, filter }
      } catch {
        return { ok: false, error: '通信エラーが発生しました' }
      }
    },
    [reload]
  )

  const remove = useCallback(
    async (id: string): Promise<Result> => {
      try {
        const res = await fetch(`/api/saved-filters/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
        if (!res.ok) return { ok: false, error: await readError(res) }
        await reload()
        return { ok: true }
      } catch {
        return { ok: false, error: '通信エラーが発生しました' }
      }
    },
    [reload]
  )

  return { filters, loading, error, reload, create, update, remove }
}
