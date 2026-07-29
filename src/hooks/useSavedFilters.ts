/**
 * 保存した絞り込み条件（共有フィルタ）の取得・作成・更新・削除。
 * 一覧は「全体共有すべて ＋ 自分の個人用」がサーバ側で絞られて返る。
 */
import { useCallback, useEffect, useState } from 'react'
import type { SavedFilter, SavedFilterInput } from '../types/savedFilter'
import { SAVED_FILTER_TARGET_CASE_LIST } from '../types/savedFilter'

type Result = { ok: boolean; error?: string; filter?: SavedFilter }

/**
 * エラーレスポンスを、原因が分かる日本語メッセージにする。
 * 「エラーが発生しました（404）」だけだと何を直せばよいか分からないため、
 * ステータスごとに次の一手が分かる文言を返し、詳細は console にも出す。
 */
async function readError(res: Response): Promise<string> {
  let raw = ''
  let apiError = ''
  try {
    raw = await res.text()
    const data = JSON.parse(raw) as { error?: string }
    apiError = data.error ?? ''
  } catch {
    /* JSON でない（HTML の404ページ等）場合は raw をそのまま診断に使う */
  }
  console.error('[saved-filters]', res.status, res.url, raw.slice(0, 300))

  // テーブル未作成（マイグレーション未適用）はメッセージから判定する
  if (/saved_filters/.test(apiError) && /does not exist|存在しません/.test(apiError)) {
    return '保存条件のテーブルがまだありません。prisma migrate を実行してください'
  }
  if (apiError) return apiError

  if (res.status === 401) return 'ログインの有効期限が切れています。再読み込みしてください'
  if (res.status === 404) {
    return '保存条件のAPIが見つかりません（404）。デプロイ状況と vercel.json のルーティングを確認してください'
  }
  if (res.status >= 500) return `サーバエラー（${res.status}）。詳細はブラウザのコンソールを確認してください`
  return `エラーが発生しました（${res.status}）。詳細はブラウザのコンソールを確認してください`
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
