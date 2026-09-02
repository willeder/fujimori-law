/**
 * 債権者を1社追加するボタン。債権者タブの並びの右端に置く。
 *
 * 事務所からのご指摘（竹谷様 2026-08-21）:
 *   「追加介入があった場合、どのようにして追加の債権者を増やしていけば良いか
 *     触り方が分かりません。タブを追加することが発生するので手動での調整が必要」
 *   「債権者追加のボタンをタブの横に追加したい」
 *
 * 追加するとタブが1つ増える。押す場所とできることが結び付くよう、タブの隣に置く。
 * 債権者名は既存の登録名から候補を出す（表記ゆれを防ぐため）。
 */
import { useEffect, useState } from 'react'
import { useCaseDispatch } from '../../store/useCaseStore'
import { SuggestInput } from '../SuggestInput'
import type { Creditor } from '../../types'

// 候補は一度取れば十分なので画面をまたいで使い回す
let nameCache: string[] | null = null

export function AddCreditorButton({
  caseId,
  disabled = false,
}: {
  caseId: number
  disabled?: boolean
}) {
  const dispatch = useCaseDispatch()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>(() => nameCache ?? [])

  useEffect(() => {
    if (nameCache || !open) return
    let alive = true
    fetch('/api/creditors/names')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { names?: string[] } | null) => {
        nameCache = d?.names ?? []
        if (alive) setSuggestions(nameCache)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open])

  const submit = async () => {
    const v = name.trim()
    if (!v) {
      setError('債権者名を入れてください')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/creditors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, creditorName: v }),
      })
      const d = (await r.json().catch(() => ({}))) as { row?: Creditor; error?: string }
      if (!r.ok || !d.row) {
        setError(d.error ?? '追加に失敗しました')
        return
      }
      dispatch({ type: 'ADD_CREDITOR', payload: d.row })
      setName('')
      setOpen(false)
    } catch {
      setError('追加に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={
          disabled
            ? '他の人が編集中のため、いまは変更できません'
            : '追加介入などで債権者が増えたときに1社足します（タブが1つ増えます）'
        }
        className="shrink-0 rounded border border-dashed border-blue-300 px-2 py-0.5 text-[0.6875rem] text-blue-600 hover:bg-blue-50 disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-transparent"
      >
        ＋ 債権者
      </button>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-1 rounded border border-blue-300 bg-white px-1 py-0.5">
      <SuggestInput
        value={name}
        onValueChange={setName}
        onSelect={(v) => setName(v)}
        suggestions={suggestions}
        placeholder="債権者名（例: アコム）"
        autoFocus
        className="w-44 rounded border border-slate-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="shrink-0 rounded bg-blue-500 px-2 py-0.5 text-[0.6875rem] text-white hover:bg-blue-600 disabled:bg-slate-300"
      >
        追加
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false)
          setName('')
          setError(null)
        }}
        className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[0.6875rem] text-slate-600 hover:bg-slate-100"
      >
        取消
      </button>
      {error && <span className="whitespace-nowrap text-[0.6875rem] text-red-600">{error}</span>}
    </span>
  )
}
