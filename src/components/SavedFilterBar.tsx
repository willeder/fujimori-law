/**
 * 保存した絞り込み条件（共有フィルタ）のツールバー。
 *
 *   [ 保存された条件… ▼ ]  [ この条件を保存 ]  [ 管理 ]  （適用中：〇〇 [解除]）
 *
 * - 全体共有した条件は全ユーザーのプルダウンに出る（kintone の共有一覧に相当）
 * - 個人用は作成者本人にだけ出る
 * - 編集・削除できるのは作成者本人と管理者だけ（可否はサーバが canEdit で返す）
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useSavedFilters } from '../hooks/useSavedFilters'
import {
  normalizeCaseListPayload,
  type CaseListFilterPayload,
  type SavedFilter,
  type SavedFilterScope,
} from '../types/savedFilter'
import { NO_VALUE_OPERATORS, OPERATOR_LABEL, isEffectiveCondition } from '../types/filter'

const btn =
  'rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40'
const btnPrimary =
  'rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50'
const input = 'w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500'

/** 条件の内容を人が読める1行にする（一覧のプレビュー用） */
function describe(payload: CaseListFilterPayload, fieldLabel: (f: string) => string): string {
  const parts: string[] = []
  if (payload.quick?.value?.trim()) parts.push(`検索:${payload.quick.value}`)
  for (const c of payload.filter?.conditions ?? []) {
    const label = fieldLabel(c.field)
    if (NO_VALUE_OPERATORS.includes(c.operator)) {
      parts.push(`${label} ${OPERATOR_LABEL[c.operator]}`)
      continue
    }
    const vals = (c.values ?? []).filter((v) => String(v).trim() !== '')
    if (vals.length === 0) continue
    parts.push(`${label} ${OPERATOR_LABEL[c.operator]} ${vals.join('・')}`)
  }
  if (payload.sort) parts.push(`並び:${payload.sort.key} ${payload.sort.order === 'asc' ? '↑' : '↓'}`)
  const joiner = payload.filter?.logic === 'or' ? ' または ' : ' / '
  return parts.length ? parts.join(joiner) : '(条件なし)'
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-1 text-lg leading-none text-slate-400 hover:text-slate-700"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
        <div className="max-h-[65vh] overflow-auto p-4">{children}</div>
      </div>
    </div>
  )
}

export function SavedFilterBar({
  current,
  activeId,
  onApply,
  onClear,
  fieldLabel,
  saveRequestToken = 0,
}: {
  /** 今の画面の絞り込み状態（保存ボタンで保存される内容） */
  current: CaseListFilterPayload
  /** 適用中の条件ID。未適用なら null */
  activeId: string | null
  onApply: (filter: SavedFilter) => void
  onClear: () => void
  /** 検索フィールドのコードを日本語ラベルにする関数 */
  fieldLabel: (field: string) => string
  /**
   * 値が変わるたびに保存ダイアログを開く。
   * 絞り込みモーダルの「保存」ボタンから呼び出すために使う（0 のときは何もしない）。
   */
  saveRequestToken?: number
}) {
  const { filters, loading, error, create, update, remove } = useSavedFilters()
  const [saveOpen, setSaveOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  useEffect(() => {
    // 絞り込みモーダルの「保存」から呼ばれたときだけ開く
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saveRequestToken > 0) setSaveOpen(true)
  }, [saveRequestToken])

  const shared = filters.filter((f) => f.scope === 'SHARED')
  const priv = filters.filter((f) => f.scope === 'PRIVATE')
  const active = filters.find((f) => f.id === activeId) ?? null

  return (
    <>
      <select
        value={activeId ?? ''}
        disabled={loading}
        onChange={(e) => {
          const found = filters.find((f) => f.id === e.target.value)
          if (found) onApply(found)
          else onClear()
        }}
        className="max-w-[220px] rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
        title="保存された絞り込み条件"
      >
        <option value="">{loading ? '読み込み中…' : '保存された条件…'}</option>
        {shared.length > 0 && (
          <optgroup label="全体共有">
            {shared.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </optgroup>
        )}
        {priv.length > 0 && (
          <optgroup label="個人用">
            {priv.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <button type="button" onClick={() => setSaveOpen(true)} className={btn}>
        この条件を保存
      </button>
      <button type="button" onClick={() => setManageOpen(true)} className={btn}>
        管理
      </button>
      {active && (
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[0.625rem] text-blue-700">
          適用中：{active.name}
        </span>
      )}
      {error && (
        <span
          title={error}
          className="max-w-[280px] truncate text-[0.625rem] text-rose-600"
        >
          {error}
        </span>
      )}

      {saveOpen && (
        <SaveDialog
          current={current}
          onClose={() => setSaveOpen(false)}
          onSubmit={async (name, description, scope) => {
            const r = await create({ name, description, scope, payload: current })
            if (r.ok) setSaveOpen(false)
            return r.error
          }}
        />
      )}

      {manageOpen && (
        <Modal title="保存された絞り込み条件" onClose={() => setManageOpen(false)} wide>
          <ManageList
            filters={filters}
            current={current}
            fieldLabel={fieldLabel}
            onApply={(f) => {
              onApply(f)
              setManageOpen(false)
            }}
            onUpdate={update}
            onRemove={remove}
          />
        </Modal>
      )}
    </>
  )
}

// ── 保存ダイアログ ─────────────────────────────────────────
function SaveDialog({
  current,
  onClose,
  onSubmit,
}: {
  current: CaseListFilterPayload
  onClose: () => void
  onSubmit: (
    name: string,
    description: string,
    scope: SavedFilterScope
  ) => Promise<string | undefined>
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<SavedFilterScope>('SHARED')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conditionCount = (current.filter?.conditions ?? []).filter(isEffectiveCondition).length
  const hasQuick = !!current.quick?.value?.trim()
  const empty = conditionCount === 0 && !hasQuick

  const submit = async () => {
    setBusy(true)
    setError(null)
    const err = await onSubmit(name.trim(), description.trim(), scope)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Modal title="この条件を保存" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[0.6875rem] text-slate-500">
            条件名 <span className="rounded bg-rose-400 px-1 text-[0.5625rem] text-white">必須</span>
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim() && !busy) void submit()
            }}
            placeholder="例）今月受任・進行中"
            className={input}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[0.6875rem] text-slate-500">公開範囲</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as SavedFilterScope)}
            className={input}
          >
            <option value="SHARED">全体共有（全員が使える）</option>
            <option value="PRIVATE">個人用（自分だけ）</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[0.6875rem] text-slate-500">説明（任意）</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="どんなときに使う条件かメモできます"
            className={input}
          />
        </label>

        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[0.6875rem] text-slate-600">
          <div className="mb-1 font-medium text-slate-500">保存される内容</div>
          <div>クイック検索：{hasQuick ? current.quick.value : '（なし）'}</div>
          <div>詳細検索の条件：{conditionCount} 件</div>
          <div>
            並び順：
            {current.sort
              ? `${current.sort.key} ${current.sort.order === 'asc' ? '昇順' : '降順'}`
              : '既定（No 昇順）'}
          </div>
        </div>

        {empty && (
          <p className="text-[0.6875rem] text-amber-600">
            条件が空のままです。この状態で保存すると「絞り込みなし」の条件になります。
          </p>
        )}
        {error && <p className="text-[0.6875rem] text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btn}>
            キャンセル
          </button>
          <button
            type="button"
            disabled={!name.trim() || busy}
            onClick={() => void submit()}
            className={btnPrimary}
          >
            {busy ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── 管理（一覧・編集・削除） ────────────────────────────────
function ManageList({
  filters,
  current,
  fieldLabel,
  onApply,
  onUpdate,
  onRemove,
}: {
  filters: SavedFilter[]
  current: CaseListFilterPayload
  fieldLabel: (field: string) => string
  onApply: (filter: SavedFilter) => void
  onUpdate: (
    id: string,
    input: Partial<{
      name: string
      description: string
      scope: SavedFilterScope
      payload: CaseListFilterPayload
    }>
  ) => Promise<{ ok: boolean; error?: string }>
  onRemove: (id: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftScope, setDraftScope] = useState<SavedFilterScope>('SHARED')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const startEdit = (f: SavedFilter) => {
    setEditingId(f.id)
    setDraftName(f.name)
    setDraftScope(f.scope)
    setError(null)
  }

  const run = async (id: string, action: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusyId(id)
    setError(null)
    const r = await action()
    setBusyId(null)
    if (!r.ok) setError(r.error ?? 'エラーが発生しました')
    return r.ok
  }

  if (filters.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
        保存された条件はまだありません。<br />
        一覧で絞り込んでから「この条件を保存」を押すと、ここに追加されます。
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-[0.6875rem] text-rose-600">{error}</p>}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[0.6875rem] text-slate-500">
            <th className="py-1.5 pr-2">条件名</th>
            <th className="py-1.5 pr-2 whitespace-nowrap">公開範囲</th>
            <th className="py-1.5 pr-2">内容</th>
            <th className="py-1.5 pr-2 whitespace-nowrap">作成者</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody>
          {filters.map((f) => {
            const editing = editingId === f.id
            const busy = busyId === f.id
            return (
              <tr key={f.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-2">
                  {editing ? (
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      className={input}
                    />
                  ) : (
                    <>
                      <div className="font-medium text-slate-800">{f.name}</div>
                      {f.description && (
                        <div className="text-[0.625rem] text-slate-500">{f.description}</div>
                      )}
                    </>
                  )}
                </td>
                <td className="py-2 pr-2">
                  {editing ? (
                    <select
                      value={draftScope}
                      onChange={(e) => setDraftScope(e.target.value as SavedFilterScope)}
                      className={input}
                    >
                      <option value="SHARED">全体共有</option>
                      <option value="PRIVATE">個人用</option>
                    </select>
                  ) : f.scope === 'SHARED' ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[0.625rem] text-emerald-700">
                      全体共有
                    </span>
                  ) : (
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[0.625rem] text-slate-600">
                      個人用
                    </span>
                  )}
                </td>
                <td className="max-w-[260px] py-2 pr-2 text-[0.625rem] text-slate-500">
                  {describe(normalizeCaseListPayload(f.payload), fieldLabel)}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-[0.625rem] text-slate-500">
                  {f.ownerLabel}
                </td>
                <td className="py-2 whitespace-nowrap text-right">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        disabled={busy || !draftName.trim()}
                        onClick={() =>
                          void run(f.id, () =>
                            onUpdate(f.id, { name: draftName.trim(), scope: draftScope })
                          ).then((ok) => {
                            if (ok) setEditingId(null)
                          })
                        }
                        className={`${btnPrimary} mr-1`}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className={btn}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onApply(f)}
                        className={`${btn} mr-1`}
                      >
                        適用
                      </button>
                      {f.canEdit && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            title="いまの画面の絞り込み内容で、この条件を上書きします"
                            onClick={() => {
                              if (!window.confirm(`「${f.name}」を現在の絞り込み内容で上書きします。よろしいですか？`))
                                return
                              void run(f.id, () => onUpdate(f.id, { payload: current }))
                            }}
                            className={`${btn} mr-1`}
                          >
                            今の条件で上書き
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startEdit(f)}
                            className={`${btn} mr-1`}
                          >
                            名前変更
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(`「${f.name}」を削除します。よろしいですか？`)) return
                              void run(f.id, () => onRemove(f.id))
                            }}
                            className="rounded border border-rose-200 bg-white px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                          >
                            削除
                          </button>
                        </>
                      )}
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[0.625rem] text-slate-400">
        ※ 編集・削除できるのは、自分が作成した条件と管理者のみです。
      </p>
    </div>
  )
}
