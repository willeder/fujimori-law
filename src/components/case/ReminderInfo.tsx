/**
 * リマインド情報コンポーネント
 */
import { EditableField } from '../EditableField'
import type { ReminderInfo as ReminderInfoType } from '../../types'

interface ReminderInfoProps {
  data: ReminderInfoType
  onChange: (field: keyof ReminderInfoType, value: string) => void
  readonly?: boolean
}

export function ReminderInfo({ data, onChange, readonly = false }: ReminderInfoProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <EditableField
        label="リマインド日"
        value={data.reminderDate}
        onChange={(v) => onChange('reminderDate', v)}
        type="date"
        disabled={readonly}
      />
      <EditableField
        label="リマインド時間"
        value={data.reminderTime}
        onChange={(v) => onChange('reminderTime', v)}
        disabled={readonly}
      />
      <EditableField
        label="次回対応日"
        value={data.nextResponseDate}
        onChange={(v) => onChange('nextResponseDate', v)}
        type="date"
        disabled={readonly}
      />
      <EditableField
        label="対応時間"
        value={data.responseTime}
        onChange={(v) => onChange('responseTime', v)}
        disabled={readonly}
      />
    </div>
  )
}
