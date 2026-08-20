/**
 * 案件詳細の上部に出す「未対応のリマインド」。
 *
 * 事務所からのご要望:
 *   「リマインドがあれば画面の上部に毎回見せてほしい」
 * 下の折りたたみセクションに入れていると、開かないと気づけない。
 * 案件を開いた時点で必ず目に入る位置に、未対応のものだけを出す。
 *
 * 未対応が1件も無いときは何も描かない（空の枠が常に居座らないように）。
 * 期日を過ぎたものは赤、当日は橙で分ける。
 */
import { useCaseReminders, todayYmd } from '../../hooks/useCaseReminders'

export function CaseReminderBanner({
  caseId,
  locked = false,
}: {
  caseId: number
  locked?: boolean
}) {
  const { rows, patch } = useCaseReminders(caseId)
  const today = todayYmd()

  const open = rows
    .filter((r) => !r.done)
    .slice()
    .sort((a, b) => {
      // 期日の早い順。期日なしは最後
      const av = a.dueDate ?? '9999-99-99'
      const bv = b.dueDate ?? '9999-99-99'
      return av.localeCompare(bv) || a.id - b.id
    })

  if (open.length === 0) return null

  const overdue = open.filter((r) => r.dueDate != null && r.dueDate < today).length
  const dueToday = open.filter((r) => r.dueDate === today).length

  return (
    <div
      className={`border-b px-4 py-2 ${
        overdue > 0 ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <span className={`font-bold ${overdue > 0 ? 'text-red-700' : 'text-amber-800'}`}>
          リマインド {open.length}件
        </span>
        {overdue > 0 && (
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            期日超過 {overdue}件
          </span>
        )}
        {dueToday > 0 && (
          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            本日 {dueToday}件
          </span>
        )}
        <span className="text-slate-500">対応したらチェックを入れてください</span>
      </div>
      <ul className="space-y-0.5">
        {open.map((r) => {
          const isOverdue = r.dueDate != null && r.dueDate < today
          const isToday = r.dueDate === today
          return (
            <li key={r.id} className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={false}
                disabled={locked}
                onChange={() => void patch(r.id, { done: true })}
                className="mt-0.5 shrink-0"
                title="対応が済んだらチェック"
              />
              <span
                className={`w-24 shrink-0 tabular-nums ${
                  isOverdue
                    ? 'font-bold text-red-700'
                    : isToday
                      ? 'font-bold text-amber-700'
                      : 'text-slate-500'
                }`}
              >
                {r.dueDate ?? '期日なし'}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-slate-800">
                {r.body}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
