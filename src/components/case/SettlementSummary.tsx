/**
 * 和解進捗サマリコンポーネント
 */
import { EditableField } from '../EditableField'
import type { Creditor, SettlementInfo } from '../../types'

interface SettlementSummaryProps {
  settlementInfo: SettlementInfo
  creditors: Creditor[]
  onChange: (field: keyof SettlementInfo, value: string) => void
  readonly?: boolean
}

export function SettlementSummary({
  settlementInfo,
  creditors,
  onChange,
  readonly = false,
}: SettlementSummaryProps) {
  // 和解済み社数を計算
  const settledCount = creditors.filter((c) =>
    ['和解済', '弁済中', '完済'].includes(c.status)
  ).length
  const totalCreditors = creditors.length
  const progressPercent = totalCreditors > 0 ? (settledCount / totalCreditors) * 100 : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">和解済み</span>
        <span className="text-2xl font-bold text-green-600">
          {settledCount}/{totalCreditors}
          <span className="text-sm font-normal text-slate-400 ml-1">社</span>
        </span>
      </div>

      {/* プログレスバー */}
      <div className="w-full bg-slate-200 rounded-full h-2">
        <div
          className="bg-green-500 h-2 rounded-full transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 pt-2">
        <EditableField
          label="ステータス"
          value={settlementInfo.status}
          onChange={(v) => onChange('status', v)}
          type="select"
          options={[
            { value: '資格者面談待ち', label: '資格者面談待ち' },
            { value: '和解交渉中', label: '和解交渉中' },
            { value: '全和解済_支払中', label: '全和解済_支払中' },
            { value: 'キャンセル', label: 'キャンセル' },
          ]}
          disabled={readonly}
        />
        <EditableField
          label="和解提案予定日"
          value={settlementInfo.proposalDate}
          onChange={(v) => onChange('proposalDate', v)}
          type="date"
          disabled={readonly}
        />
      </div>
    </div>
  )
}
