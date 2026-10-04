/**
 * CSV出力の「出力設定」（どの項目を・どの順で出すか）を名前を付けて保存・呼び出すバー。
 *
 * 事務所からのご要望（田中様 2026-10-02）:
 *   「kintone は出力順を変動・指定できる形なので同じように出力でき、
 *     その出力順などを保存できれば嬉しい」
 * 保存は「保存した絞り込み条件」と同じ仕組み（/api/saved-filters、target=csvExport）。
 * 事務所の全員が、どのPCからでも同じ設定を使える（公開範囲は「共有」）。
 * 最初から用意している設定（presets）は消せない。
 */
import { useEffect, useState } from 'react'
import type { CsvLayoutPayload } from '../constants/csvColumns'

type SavedLayout = {
  id: string
  name: string
  payload: CsvLayoutPayload
  canEdit: boolean
}

/** 保存済みの出力設定を取る。取れないときは null（用意済みの設定だけで使える） */
async function fetchLayouts(target: string): Promise<SavedLayout[] | 'expired' | null> {
  try {
    const r = await fetch(`/api/saved-filters?target=${encodeURIComponent(target)}`)
    if (r.status === 401) return 'expired'
    if (!r.ok) return null
    return (await r.json()) as SavedLayout[]
  } catch {
    return null
  }
}

export function CsvLayoutBar({
  target,
  presets,
  current,
  onApply,
}: {
  target: string
  presets: { id: string; name: string; payload: CsvLayoutPayload }[]
  /** いまの画面の選択を出力設定の形にしたもの（保存用） */
  current: () => CsvLayoutPayload
  onApply: (payload: CsvLayoutPayload) => void
}) {
  const [saved, setSaved] = useState<SavedLayout[]>([])
  const [selected, setSelected] = useState('')
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = async () => {
    const r = await fetchLayouts(target)
    if (r === 'expired') setMessage('ログインの有効期限が切れています。再読み込みしてください')
    else if (r) setSaved(r)
  }
  useEffect(() => {
    let alive = true
    void fetchLayouts(target).then((r) => {
      if (!alive) return
      if (r === 'expired') setMessage('ログインの有効期限が切れています。再読み込みしてください')
      else if (r) setSaved(r)
    })
    return () => {
      alive = false
    }
  }, [target])

  const all = [
    ...presets.map((p) => ({ ...p, canEdit: false, preset: true })),
    ...saved.map((s) => ({ ...s, preset: false })),
  ]
  const sel = all.find((x) => x.id === selected) ?? null

  const apply = (id: string) => {
    setSelected(id)
    setMessage(null)
    const x = all.find((l) => l.id === id)
    if (x) onApply(x.payload)
  }

  const request = async (url: string, method: string, body?: unknown) => {
    setBusy(true)
    setMessage(null)
    try {
      const r = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (r.status === 401) {
        setMessage('ログインの有効期限が切れています。再読み込みしてください')
        return null
      }
      const res = (await r.json().catch(() => ({}))) as { id?: string; error?: string }
      if (!r.ok) {
        setMessage(res.error ?? `保存できませんでした（HTTP ${r.status}）`)
        return null
      }
      return res
    } catch {
      setMessage('保存できませんでした（通信に失敗しました）')
      return null
    } finally {
      setBusy(false)
    }
  }

  const saveNew = async () => {
    const n = name.trim()
    if (!n) {
      setMessage('名前を入れてください')
      return
    }
    const res = await request('/api/saved-filters', 'POST', {
      target,
      name: n,
      scope: 'SHARED',
      payload: current(),
    })
    if (!res) return
    setNaming(false)
    setName('')
    await load()
    if (res.id) setSelected(res.id)
    setMessage(`「${n}」を保存しました`)
  }

  const overwrite = async () => {
    if (!sel || sel.preset || !sel.canEdit) return
    const res = await request(`/api/saved-filters/${sel.id}`, 'PATCH', { payload: current() })
    if (!res) return
    await load()
    setMessage(`「${sel.name}」を今の設定で上書きしました`)
  }

  const remove = async () => {
    if (!sel || sel.preset || !sel.canEdit) return
    if (!window.confirm(`出力設定「${sel.name}」を削除しますか？`)) return
    const res = await request(`/api/saved-filters/${sel.id}`, 'DELETE')
    if (!res) return
    setSelected('')
    await load()
    setMessage(`「${sel.name}」を削除しました`)
  }

  const btn =
    'rounded border border-slate-300 bg-white px-2 py-0.5 text-[0.6875rem] text-slate-600 hover:bg-slate-100 disabled:opacity-40'

  return (
    <div className="mx-4 mb-2 shrink-0 rounded border border-sky-200 bg-sky-50 px-3 py-2">
      <div className="mb-1 text-[0.6875rem] font-semibold text-sky-800">保存した出力設定</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={selected}
          onChange={(e) => apply(e.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
        >
          <option value="">（選ぶと項目と並びを読み込みます）</option>
          {all.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        {sel && !sel.preset && sel.canEdit && (
          <>
            <button type="button" className={btn} disabled={busy} onClick={() => void overwrite()}>
              上書き保存
            </button>
            <button type="button" className={btn} disabled={busy} onClick={() => void remove()}>
              削除
            </button>
          </>
        )}
        {!naming && (
          <button type="button" className={btn} disabled={busy} onClick={() => setNaming(true)}>
            今の設定を保存…
          </button>
        )}
      </div>
      {naming && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveNew()
            }}
            placeholder="例: 入金調整用"
            maxLength={80}
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
          />
          <button type="button" className={btn} disabled={busy} onClick={() => void saveNew()}>
            保存
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              setNaming(false)
              setName('')
            }}
          >
            やめる
          </button>
        </div>
      )}
      {message && <p className="mt-1 text-[0.625rem] text-sky-800">{message}</p>}
      <p className="mt-1 text-[0.625rem] leading-relaxed text-slate-500">
        保存した設定は事務所の全員が使えます（上書き・削除は作成者と管理者のみ）。
      </p>
    </div>
  )
}
