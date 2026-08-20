/**
 * 案件のリマインドを、画面内の複数箇所で同じ状態のまま扱うための共有フック。
 *
 * 案件詳細では、上部のバナー（未対応の一覧）と下の「リマインド」セクション（追加・編集）
 * の2か所に出る。それぞれが個別に取得すると、片方で「済」にしても
 * もう片方に残ってしまうため、案件IDごとに1つの状態を共有する。
 *
 * 案件をまたいで持ち越さないよう、キャッシュは案件IDごとに分けている。
 */
import { useCallback, useEffect, useState } from 'react'

export type Reminder = {
  id: number
  caseId: number
  dueDate: string | null
  body: string
  done: boolean
  doneAt: string | null
  doneBy: string | null
  source: string
  createdAt: string
}

const cache = new Map<number, Reminder[]>()
const listeners = new Map<number, Set<() => void>>()
/** 同じ案件で取得が重ならないようにする */
const inflight = new Map<number, Promise<void>>()

function emit(caseId: number) {
  listeners.get(caseId)?.forEach((fn) => fn())
}

function setRows(caseId: number, rows: Reminder[]) {
  cache.set(caseId, rows)
  emit(caseId)
}

async function fetchRows(caseId: number): Promise<void> {
  const running = inflight.get(caseId)
  if (running) return running
  const p = fetch(`/api/cases/${caseId}/reminders`)
    .then((r) => (r.ok ? (r.json() as Promise<Reminder[]>) : null))
    .then((d) => {
      if (d) setRows(caseId, d)
    })
    .catch(() => {
      /* 次回の再取得で回復 */
    })
    .finally(() => {
      inflight.delete(caseId)
    })
  inflight.set(caseId, p)
  return p
}

export function useCaseReminders(caseId: number | undefined) {
  const [, bump] = useState(0)

  useEffect(() => {
    if (!caseId) return
    const fn = () => bump((v) => v + 1)
    let set = listeners.get(caseId)
    if (!set) {
      set = new Set()
      listeners.set(caseId, set)
    }
    set.add(fn)
    void fetchRows(caseId)
    return () => {
      set?.delete(fn)
      if (set && set.size === 0) {
        listeners.delete(caseId)
        // 画面を離れたら捨てる（別の案件を開いたときに古い内容を見せない）
        cache.delete(caseId)
      }
    }
  }, [caseId])

  const rows = (caseId ? cache.get(caseId) : undefined) ?? []
  const reload = useCallback(() => {
    if (caseId) void fetchRows(caseId)
  }, [caseId])

  /** 追加。サーバの応答をそのまま足す */
  const add = useCallback(
    async (dueDate: string | null, body: string): Promise<string | null> => {
      if (!caseId) return '案件が特定できません'
      const r = await fetch(`/api/cases/${caseId}/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate, body }),
      })
      const d = (await r.json()) as { reminder?: Reminder; error?: string }
      if (!r.ok || !d.reminder) return d.error ?? '追加できませんでした'
      setRows(caseId, [...(cache.get(caseId) ?? []), d.reminder])
      return null
    },
    [caseId]
  )

  /** 更新。先に画面へ反映し、失敗したら取り直す */
  const patch = useCallback(
    async (id: number, data: Partial<Pick<Reminder, 'done' | 'body' | 'dueDate'>>) => {
      if (!caseId) return
      setRows(
        caseId,
        (cache.get(caseId) ?? []).map((r) => (r.id === id ? { ...r, ...data } : r))
      )
      const r = await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(() => null)
      if (!r || !r.ok) void fetchRows(caseId)
    },
    [caseId]
  )

  const remove = useCallback(
    async (id: number) => {
      if (!caseId) return
      setRows(caseId, (cache.get(caseId) ?? []).filter((r) => r.id !== id))
      const r = await fetch(`/api/reminders/${id}`, { method: 'DELETE' }).catch(() => null)
      if (!r || !r.ok) void fetchRows(caseId)
    },
    [caseId]
  )

  return { rows, reload, add, patch, remove }
}

/** 今日の日付（YYYY-MM-DD）。期日超過の判定に使う */
export function todayYmd(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
