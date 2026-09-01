/**
 * 案件詳細の上部リマインド。追加・編集・完了までここだけで完結する。
 *
 * 事務所からのご要望:
 *   「リマインドは履歴として残す必要はないので、リマインドしたい時に日付とメモを
 *     出してリマインドを上部のみにしてほしい」
 *   「リマインドは種類が3つあるので、それぞれどのリマインドなのか分かるようにしてほしい」
 *   「上部のみでそこで追加もできるようにして欲しい。また種類の追加もできるようにしたい」
 *
 * この案件に関わるリマインドは3系統あり、保存先がそれぞれ違う。
 *   案件   … 案件ごとのリマインド（kintone の「★リマインド」由来）。日付＋メモ。済にできる
 *   依頼者 … 案件の「リマインド日」。日付だけ（メモを持つ項目が無い）
 *   債権者 … 各社の「次回処理日時」と「リマインド」。日付＋メモ
 * 追加するときに種類を選ぶと、その保存先へ入る。画面上の見え方は3つとも同じ。
 *
 * 案件のリマインドは未対応のものを常に出す。依頼者・債権者は期日が来たもの
 * （今日以前）だけを出す。先の予定まで並べると常に何か出ていて意味がなくなるため。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCaseReminders, todayYmd } from '../../hooks/useCaseReminders'
import { useCase, useCaseDispatch, useCreditorsByCaseId } from '../../store/useCaseStore'
import { isValidYmd } from '../../lib/dateInput'
import { DateTextInput } from '../DateTextInput'

type Kind = 'case' | 'client' | 'creditor'

const KIND_LABEL: Record<Kind, { label: string; cls: string }> = {
  case: { label: '案件', cls: 'bg-amber-200 text-amber-900' },
  client: { label: '依頼者', cls: 'bg-blue-200 text-blue-900' },
  creditor: { label: '債権者', cls: 'bg-indigo-200 text-indigo-900' },
}

type Item = {
  key: string
  kind: Kind
  dueDate: string | null
  body: string
  /** 案件リマインドのとき */
  reminderId?: number
  /** 債権者リマインドのとき */
  creditorId?: number
}

export function CaseReminderBanner({
  caseId,
  locked = false,
}: {
  caseId: number
  locked?: boolean
}) {
  const navigate = useNavigate()
  const dispatch = useCaseDispatch()
  const { rows, add, patch, remove } = useCaseReminders(caseId)
  const caseData = useCase(caseId)
  const creditors = useCreditorsByCaseId(caseId)
  const today = todayYmd()

  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('case')
  const [creditorId, setCreditorId] = useState<number | null>(null)
  const [due, setDue] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const items: Item[] = []

  // ① 案件のリマインド（未対応のものすべて）
  for (const r of rows) {
    if (r.done) continue
    items.push({
      key: `case-${r.id}`,
      kind: 'case',
      dueDate: r.dueDate,
      body: r.body,
      reminderId: r.id,
    })
  }
  // ② 依頼者のリマインド日（期日が来たものだけ）
  const clientDue = caseData?.reminderInfo?.reminderDate ?? null
  if (clientDue && clientDue <= today) {
    items.push({
      key: 'client',
      kind: 'client',
      dueDate: clientDue,
      body: 'リマインド日が来ています',
    })
  }
  // ③ 債権者ごとの次回処理日（期日が来たものだけ）
  for (const c of creditors) {
    const d = c.nextProcessDate ? c.nextProcessDate.slice(0, 10) : null
    if (!d || d > today) continue
    const memo = (c.reminder ?? '').trim()
    items.push({
      key: `creditor-${c.id}`,
      kind: 'creditor',
      dueDate: d,
      body: memo ? `${c.creditorName}：${memo}` : `${c.creditorName}：次回処理日`,
      creditorId: c.id,
    })
  }

  items.sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'))

  const overdue = items.filter((i) => i.dueDate != null && i.dueDate < today).length
  const dueToday = items.filter((i) => i.dueDate === today).length
  const countOf = (k: Kind) => items.filter((i) => i.kind === k).length

  /** 依頼者のリマインド日を書き換える */
  const setClientReminder = async (value: string | null) => {
    if (!caseData) return
    dispatch({
      type: 'UPDATE_CASE',
      payload: {
        ...caseData,
        reminderInfo: { ...caseData.reminderInfo, reminderDate: value },
      },
    })
    await fetch(`/api/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reminderDate: value }),
    }).catch(() => {})
  }

  /** 債権者の次回処理日とメモを書き換える */
  const setCreditorReminder = async (id: number, date: string | null, memo?: string) => {
    const target = creditors.find((c) => c.id === id)
    if (!target) return
    const updates: { nextProcessDate: string | null; reminder?: string | null } = {
      nextProcessDate: date,
    }
    if (memo !== undefined) updates.reminder = memo || null
    dispatch({ type: 'UPDATE_CREDITOR', payload: { ...target, ...updates } })
    await fetch(`/api/creditors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => {})
  }

  const resetForm = () => {
    setKind('case')
    setCreditorId(null)
    setDue('')
    setBody('')
    setError(null)
  }

  const submit = async () => {
    if (due && !isValidYmd(due)) {
      setError('期日が正しくありません（YYYY-MM-DD）')
      return
    }
    if (kind === 'case' && !body.trim()) {
      setError('やることを入れてください')
      return
    }
    if (kind !== 'case' && !due) {
      setError('期日を入れてください')
      return
    }
    if (kind === 'creditor' && creditorId == null) {
      setError('どの債権者かを選んでください')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (kind === 'case') {
        const err = await add(due || null, body.trim())
        if (err) {
          setError(err)
          return
        }
      } else if (kind === 'client') {
        await setClientReminder(due)
      } else if (creditorId != null) {
        await setCreditorReminder(creditorId, due, body.trim())
      }
      resetForm()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  /** 済にする。案件は完了フラグ、依頼者・債権者は日付を空にする */
  const complete = async (it: Item) => {
    if (it.reminderId != null) {
      await patch(it.reminderId, { done: true })
      return
    }
    if (it.kind === 'client') {
      await setClientReminder(null)
      return
    }
    if (it.creditorId != null) await setCreditorReminder(it.creditorId, null)
  }

  const removeItem = async (it: Item) => {
    if (it.reminderId == null) return
    if (!window.confirm('このリマインドを削除しますか？')) return
    await remove(it.reminderId)
  }

  // 出すものが1件も無く、追加フォームも閉じているときは帯ごと隠す
  if (items.length === 0 && !open) {
    return (
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={locked}
          className="text-xs text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
        >
          ＋ リマインドを追加
        </button>
      </div>
    )
  }

  return (
    <div
      className={`border-b px-4 py-2 ${
        overdue > 0 ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <span className={`font-bold ${overdue > 0 ? 'text-red-700' : 'text-amber-800'}`}>
          リマインド {items.length}件
        </span>
        {overdue > 0 && (
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
            期日超過 {overdue}件
          </span>
        )}
        {dueToday > 0 && (
          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
            本日 {dueToday}件
          </span>
        )}
        {(['case', 'client', 'creditor'] as Kind[]).map((k) =>
          countOf(k) > 0 ? (
            <span
              key={k}
              className={`rounded px-1.5 py-0.5 text-[0.625rem] font-bold ${KIND_LABEL[k].cls}`}
            >
              {KIND_LABEL[k].label} {countOf(k)}
            </span>
          ) : null
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={locked}
          className="ml-auto rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:border-slate-200 disabled:text-slate-300"
        >
          {open ? '追加をやめる' : '＋ リマインドを追加'}
        </button>
      </div>

      {open && (
        <div className="mb-2 rounded border border-slate-300 bg-white p-2">
          <div className="flex flex-wrap items-center gap-1">
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind)
                setError(null)
              }}
              className="shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs"
              title="どの種類のリマインドにするか"
            >
              <option value="case">案件</option>
              <option value="client">依頼者</option>
              <option value="creditor">債権者</option>
            </select>
            {kind === 'creditor' && (
              <select
                value={creditorId ?? ''}
                onChange={(e) => setCreditorId(e.target.value ? Number(e.target.value) : null)}
                className="min-w-0 max-w-[12rem] shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs"
              >
                <option value="">債権者を選ぶ</option>
                {creditors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.creditorName}
                  </option>
                ))}
              </select>
            )}
            <DateTextInput
              value={due}
              onChange={setDue}
              onPick={setDue}
              placeholder="20260930"
              className="w-28 shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs"
            />
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
              disabled={kind === 'client'}
              placeholder={
                kind === 'client'
                  ? '依頼者のリマインドは日付だけです'
                  : 'やること（例: 給与口座の変更を確認する）'
              }
              className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-100 disabled:text-slate-400"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="shrink-0 rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:bg-slate-300"
            >
              追加
            </button>
          </div>
          <div className="mt-1 text-[0.625rem] text-slate-500">
            {kind === 'case' && '案件ごとのリマインドとして追加します。済のチェックが付きます。'}
            {kind === 'client' && '案件の「リマインド日」に入ります。メモを持つ項目が無いため日付だけです。'}
            {kind === 'creditor' && '選んだ債権者の「次回処理日時」と「リマインド」に入ります。'}
          </div>
          {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
        </div>
      )}

      <ul className="space-y-0.5">
        {items.map((it) => {
          const isOverdue = it.dueDate != null && it.dueDate < today
          const isToday = it.dueDate === today
          return (
            <li key={it.key} className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={false}
                disabled={locked}
                onChange={() => void complete(it)}
                className="mt-0.5 shrink-0"
                title={
                  it.kind === 'case'
                    ? '対応が済んだらチェック'
                    : '対応が済んだらチェック（日付を空にします）'
                }
              />
              <span
                className={`shrink-0 rounded px-1 py-px text-[0.625rem] font-bold ${KIND_LABEL[it.kind].cls}`}
              >
                {KIND_LABEL[it.kind].label}
              </span>
              <span
                className={`w-24 shrink-0 tabular-nums ${
                  isOverdue
                    ? 'font-bold text-red-700'
                    : isToday
                      ? 'font-bold text-amber-700'
                      : 'text-slate-500'
                }`}
              >
                {it.dueDate ?? '期日なし'}
              </span>
              {it.creditorId != null ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/cases/${caseId}`, { state: { focusCreditorId: it.creditorId } })
                  }
                  className="min-w-0 flex-1 text-left text-slate-800 underline decoration-dotted underline-offset-2 hover:text-blue-700"
                  title="この債権者のタブを開きます"
                >
                  {it.body}
                </button>
              ) : (
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-slate-800">
                  {it.body}
                </span>
              )}
              {it.reminderId != null && (
                <button
                  type="button"
                  onClick={() => void removeItem(it)}
                  disabled={locked}
                  className="shrink-0 text-[0.625rem] text-slate-400 hover:text-red-600 disabled:text-slate-200"
                >
                  削除
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
