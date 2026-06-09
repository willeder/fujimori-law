/**
 * アポ・後確・面談情報コンポーネント
 */
import { EditableField } from '../EditableField'
import type { AppointmentInfo as AppointmentInfoType } from '../../types'

interface AppointmentInfoProps {
  data: AppointmentInfoType
  onChange: (field: keyof AppointmentInfoType, value: string) => void
  readonly?: boolean
}

export function AppointmentInfo({ data, onChange, readonly = false }: AppointmentInfoProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <EditableField
        label="アポ担当"
        value={data.appointmentStaff}
        onChange={(v) => onChange('appointmentStaff', v)}
        disabled={readonly}
      />
      <EditableField
        label="後確担当"
        value={data.followUpStaff}
        onChange={(v) => onChange('followUpStaff', v)}
        disabled={readonly}
      />
      <EditableField
        label="面談担当"
        value={data.interviewStaff}
        onChange={(v) => onChange('interviewStaff', v)}
        disabled={readonly}
      />
      <EditableField
        label="担当司法書士"
        value={data.judicialScrivener}
        onChange={(v) => onChange('judicialScrivener', v)}
        disabled={readonly}
      />
      <EditableField
        label="債務整理区分"
        value={data.debtAdjustmentType}
        onChange={(v) => onChange('debtAdjustmentType', v)}
        type="select"
        options={[
          { value: '任意整理', label: '任意整理' },
          { value: '自己破産', label: '自己破産' },
          { value: '個人再生', label: '個人再生' },
        ]}
        disabled={readonly}
      />
      <EditableField
        label="受任ランク"
        value={data.acceptanceRank}
        onChange={(v) => onChange('acceptanceRank', v)}
        type="select"
        options={[
          { value: 'A', label: 'A' },
          { value: 'B', label: 'B' },
          { value: 'C', label: 'C' },
        ]}
        disabled={readonly}
      />
      <EditableField
        label="受任日"
        value={data.acceptanceDate}
        onChange={(v) => onChange('acceptanceDate', v)}
        type="date"
        disabled={readonly}
      />
      <EditableField
        label="経過日数"
        value={data.elapsedDays}
        onChange={(v) => onChange('elapsedDays', v)}
        type="number"
        suffix="日"
        disabled={readonly}
      />
    </div>
  )
}
