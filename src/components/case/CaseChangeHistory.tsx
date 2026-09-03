/**
 * 案件の変更履歴（before/after 差分）と revert（元に戻す）。
 * 案件詳細ページで表示。
 */
import { useCallback, useEffect, useState } from 'react'
import { FIELD_LABEL } from '../../constants/fieldLabels'

type ChangeEntry = {
  id: string
  entity?: string
  action: string
  actor: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reverted: boolean
  createdAt: string
}

/**
 * 変更履歴の日時表示。
 * サーバは createdAt を UTC の ISO 文字列で返すため、以前のように文字列を
 * そのまま切り出すと日本時間より9時間ずれた時刻が出ていた
 * （事務所から「更新時間と全く違う時間が表示される」とのご指摘。宮川様 2026-08-24）。
 */
function formatJst(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const ENTITY_LABEL: Record<string, { label: string; cls: string }> = {
  Case: { label: '案件', cls: 'bg-slate-100 text-slate-600' },
  Creditor: { label: '債権者', cls: 'bg-indigo-100 text-indigo-700' },
  Payment: { label: '入金', cls: 'bg-emerald-100 text-emerald-700' },
  ContactHistory: { label: '接触履歴', cls: 'bg-sky-100 text-sky-700' },
  CaseReminder: { label: 'リマインド', cls: 'bg-amber-100 text-amber-700' },
}


/** 「このバージョンに戻す」の下見（サーバが返す、戻る内容） */
type RestorePreview = {
  entity: string
  createdAt: string
  /** この履歴より後の変更の件数。まとめて取り消される */
  laterCount: number
  items: { field: string; from: unknown; to: unknown }[]
}

const fmt = (v: unknown) =>
  v === null || v === undefined || v === '' ? '空' : String(v)

export function CaseChangeHistory({
  caseId,
  refreshKey,
  onReverted,
}: {
  caseId: number
  refreshKey: number
  onReverted: () => void
}) {
  const [changes, setChanges] = useState<ChangeEntry[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  /*
    変更箇所は既定で折りたたむ（事務所のご要望 2026-09-02。kintone と同じ）。
    以前は全ての履歴で変更前→変更後を常に開いていたため、更新の多い案件では
    枠が縦に長くなり「いつ誰が何をしたか」を追いにくかった。
    ここに入っている id の履歴だけを開く。
  */
  const [opened, setOpened] = useState<Set<string>>(new Set())
  /** 「このバージョンに戻す」の確認。実行前に何がどう戻るかを出す */
  const [restore, setRestore] = useState<{ id: string; preview: RestorePreview } | null>(null)

  const toggle = (id: string) =>
    setOpened((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const load = useCallback(() => {
    fetch(`/api/cases/${caseId}/changes`)
      .then((r) => (r.ok ? (r.json() as Promise<ChangeEntry[]>) : []))
      .then(setChanges)
      .catch(() => setChanges([]))
  }, [caseId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  /** その1件だけを打ち消す（従来の動き） */
  const revert = async (id: string) => {
    if (!window.confirm('この変更だけを取り消しますか？')) return
    setBusy(id)
    try {
      const r = await fetch(`/api/changes/${id}/revert`, { method: 'POST' })
      if (r.ok) {
        load()
        onReverted()
      } else {
        const d = (await r.json().catch(() => ({}))) as { error?: string }
        window.alert(d.error ?? '元に戻せませんでした')
      }
    } finally {
      setBusy(null)
    }
  }

  /** 「このバージョンに戻す」。まず戻る内容を取りに行き、確認してから実行する */
  const askRestore = async (id: string) => {
    setBusy(id)
    try {
      const r = await fetch(`/api/changes/${id}/restore-preview`)
      const d = (await r.json().catch(() => ({}))) as RestorePreview & { error?: string }
      if (!r.ok) {
        window.alert(d.error ?? 'この履歴には戻せません')
        return
      }
      if (!d.items || d.items.length === 0) {
        window.alert('すでにこの版の状態です。戻す項目はありません。')
        return
      }
      setRestore({ id, preview: d })
    } finally {
      setBusy(null)
    }
  }

  const doRestore = async () => {
    if (!restore) return
    setBusy(restore.id)
    try {
      const r = await fetch(`/api/changes/${restore.id}/restore`, { method: 'POST' })
      if (r.ok) {
        setRestore(null)
        load()
        onReverted()
      } else {
        const d = (await r.json().catch(() => ({}))) as { error?: string }
        window.alert(d.error ?? '戻せませんでした')
      }
    } finally {
      setBusy(null)
    }
  }

  if (changes === null)
    return <p className="px-3 py-3 text-xs text-slate-400">変更履歴を読み込み中…</p>
  if (changes.length === 0)
    return <p className="px-3 py-3 text-xs text-slate-400">変更履歴はありません。</p>

  return (
    <>
      <ul className="max-h-80 divide-y divide-slate-100 overflow-auto">
        {changes.map((c) => {
          const keys = Object.keys(c.after ?? c.before ?? {})
          const isOpen = opened.has(c.id)
          const label = (k: string) => FIELD_LABEL[k] ?? k
          // 折りたたみ中の1行まとめ。「何を変えたか」だけ分かればよい
          const summary =
            keys.length === 0
              ? '内容なし'
              : keys.length <= 2
                ? keys.map(label).join('・')
                : `${keys.slice(0, 2).map(label).join('・')} ほか${keys.length - 2}項目`
          return (
            <li key={c.id} className="px-3 py-2 text-xs">
              <div className="flex items-center gap-1 text-[0.625rem] text-slate-400">
                <span
                  className={`rounded px-1 py-0.5 font-medium ${
                    ENTITY_LABEL[c.entity ?? 'Case']?.cls ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {ENTITY_LABEL[c.entity ?? 'Case']?.label ?? c.entity}
                </span>
                {c.action === 'CREATE' && <span className="text-emerald-600">追加</span>}
                {c.action === 'DELETE' && <span className="text-red-600">削除</span>}
                {formatJst(c.createdAt)} ・ {c.actor}
                {c.reverted && <span className="ml-1 text-amber-600">（取消済）</span>}
              </div>
              <div className="mt-0.5 text-slate-700">{summary}</div>

              {/* 変更箇所（既定は閉じている） */}
              {isOpen && (
                <div className="mt-1 space-y-0.5 rounded bg-slate-50 px-2 py-1">
                  {keys.map((k) => (
                    <div key={k} className="text-slate-700">
                      <span className="text-slate-500">{label(k)}:</span>{' '}
                      <span className="text-slate-400 line-through">{fmt(c.before?.[k])}</span>
                      {' → '}
                      <span className="font-medium">{fmt(c.after?.[k])}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-1 flex flex-wrap items-center gap-3 text-[0.6875rem]">
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="text-blue-600 hover:underline"
                >
                  {isOpen ? '変更箇所を隠す' : '変更箇所を表示する'}
                </button>
                {c.action === 'UPDATE' && (
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => askRestore(c.id)}
                    className="text-blue-600 hover:underline disabled:opacity-40"
                  >
                    このバージョンに戻す
                  </button>
                )}
                {!c.reverted && c.action === 'UPDATE' && (
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => revert(c.id)}
                    className="text-slate-500 hover:underline disabled:opacity-40"
                  >
                    この変更だけ取り消す
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {/*
        「このバージョンに戻す」の確認。
        その時点より後の変更もまとめて取り消すため、何がどう戻るかを必ず見せてから実行する。
      */}
      {restore && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4"
          onClick={() => setRestore(null)}
        >
          <div
            className="mt-16 w-full max-w-lg rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-4 py-2 text-sm font-bold text-slate-800">
              このバージョンに戻す
            </div>
            <div className="px-4 py-3 text-xs text-slate-700">
              <p className="mb-2">
                {formatJst(restore.preview.createdAt)} の時点の状態に戻します。
                {restore.preview.laterCount > 0 && (
                  <>
                    <br />
                    <span className="font-bold text-red-600">
                      これより後の {restore.preview.laterCount} 件の変更もまとめて取り消されます。
                    </span>
                  </>
                )}
              </p>
              <div className="max-h-64 space-y-0.5 overflow-auto rounded border border-slate-200 bg-slate-50 px-2 py-1">
                {restore.preview.items.map((it) => (
                  <div key={it.field}>
                    <span className="text-slate-500">{FIELD_LABEL[it.field] ?? it.field}:</span>{' '}
                    <span className="text-slate-400 line-through">{fmt(it.from)}</span>
                    {' → '}
                    <span className="font-medium">{fmt(it.to)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[0.6875rem] text-slate-500">
                戻した内容も変更履歴に残るので、必要ならさらに戻せます。
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-2">
              <button
                type="button"
                onClick={() => setRestore(null)}
                className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                やめる
              </button>
              <button
                type="button"
                disabled={busy === restore.id}
                onClick={doRestore}
                className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {restore.preview.items.length}項目を戻す
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
