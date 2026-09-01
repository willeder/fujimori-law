/**
 * 案件詳細の上部に出すリマインド。
 *
 * 事務所からのご要望:
 *   「リマインドがあれば画面の上部に毎回見せてほしい」
 *   「リマインドは種類が3つあるので、それぞれどのリマインドなのか分かるようにしてほしい」
 *
 * この案件に関わるリマインドは3系統ある。別々の場所に散っていて気づけないため、
 * ここで1つにまとめ、種別のバッジを付けて出す。
 *
 *   案件   … 案件ごとのリマインド（kintone の「★リマインド」由来）。済のチェックが付く
 *   依頼者 … 案件の「リマインド日」。手動で入れる1つの日付
 *   債権者 … 各社タブの「次回処理日時」。債権者ごとに持つ
 *
 * 案件リマインドは未対応のものを常に出す。依頼者・債権者は、期日が来たもの
 * （今日以前）だけを出す。先の予定まで並べると常に何か出ていて意味がなくなるため。
 * 出すものが1件も無いときは何も描かない。
 */
import { useNavigate } from 'react-router-dom'
import { useCaseReminders, todayYmd } from '../../hooks/useCaseReminders'
import { useCase, useCreditorsByCaseId } from '../../store/useCaseStore'

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
  /** 案件リマインドだけ済にできる */
  reminderId?: number
  /** 債権者リマインドのとき、その債権者へ移動するための id */
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
  const { rows, patch } = useCaseReminders(caseId)
  const caseData = useCase(caseId)
  const creditors = useCreditorsByCaseId(caseId)
  const today = todayYmd()

  const items: Item[] = []

  // ① 案件のリマインド（未対応のものすべて）
  for (const r of rows) {
    if (r.done) continue
    items.push({ key: `case-${r.id}`, kind: 'case', dueDate: r.dueDate, body: r.body, reminderId: r.id })
  }

  // ② 依頼者のリマインド日（期日が来たものだけ）
  const clientDue = caseData?.reminderInfo?.reminderDate ?? null
  if (clientDue && clientDue <= today) {
    items.push({ key: 'client', kind: 'client', dueDate: clientDue, body: 'リマインド日が来ています' })
  }

  // ③ 債権者ごとの次回処理日（期日が来たものだけ）
  for (const c of creditors) {
    const d = c.nextProcessDate ? c.nextProcessDate.slice(0, 10) : null
    if (!d || d > today) continue
    items.push({
      key: `creditor-${c.id}`,
      kind: 'creditor',
      dueDate: d,
      body: `${c.creditorName}：次回処理日${c.status ? `（${c.status}）` : ''}`,
      creditorId: c.id,
    })
  }

  if (items.length === 0) return null

  // 期日の早い順。期日なしは最後
  items.sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'))

  const overdue = items.filter((i) => i.dueDate != null && i.dueDate < today).length
  const dueToday = items.filter((i) => i.dueDate === today).length
  const countOf = (k: Kind) => items.filter((i) => i.kind === k).length

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
        {/* 種別の内訳。どの種類のリマインドが出ているか一目で分かるように */}
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
        <span className="text-slate-500">
          案件のリマインドは対応したらチェックを入れてください
        </span>
      </div>
      <ul className="space-y-0.5">
        {items.map((it) => {
          const isOverdue = it.dueDate != null && it.dueDate < today
          const isToday = it.dueDate === today
          return (
            <li key={it.key} className="flex items-start gap-2 text-xs">
              {it.reminderId != null ? (
                <input
                  type="checkbox"
                  checked={false}
                  disabled={locked}
                  onChange={() => void patch(it.reminderId!, { done: true })}
                  className="mt-0.5 shrink-0"
                  title="対応が済んだらチェック"
                />
              ) : (
                // チェックで済にできるのは案件のリマインドだけ。
                // 依頼者・債権者は日付の項目そのものなので、幅だけ揃える。
                <span className="mt-0.5 w-3 shrink-0" aria-hidden />
              )}
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
            </li>
          )
        })}
      </ul>
    </div>
  )
}
