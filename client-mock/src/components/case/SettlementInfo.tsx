/**
 * 和解情報コンポーネント
 */
import { EditableField } from '../EditableField'
import type { SettlementInfo as SettlementInfoType } from '../../types'

interface SettlementInfoProps {
  data: SettlementInfoType
  onChange: (field: keyof SettlementInfoType, value: string) => void
  readonly?: boolean
}

export function SettlementInfo({ data, onChange, readonly = false }: SettlementInfoProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <EditableField
        label="受任後ステータス"
        value={data.status}
        onChange={(v) => onChange('status', v)}
        type="select"
        options={[
          { value: '資格者面談待ち', label: '資格者面談待ち' },
          { value: '和解交渉中', label: '和解交渉中' },
          { value: '全和解済_支払中', label: '全和解済_支払中' },
          { value: 'キャンセル', label: 'キャンセル' },
          { value: '辞任', label: '辞任' },
        ]}
        disabled={readonly}
      />
      <EditableField
        label="和解提案予定日"
        value={data.proposalDate}
        onChange={(v) => onChange('proposalDate', v)}
        type="date"
        disabled={readonly}
      />
      <EditableField
        label="和解弁済総数"
        value={data.settlementCount}
        onChange={(v) => onChange('settlementCount', v)}
        type="number"
        suffix="回"
        disabled={readonly}
      />
      <EditableField
        label="和解後代弁社数"
        value={data.postSettlementPaymentCount}
        onChange={(v) => onChange('postSettlementPaymentCount', v)}
        type="number"
        suffix="社"
        disabled={readonly}
      />
      <EditableField
        label="予定弁済総数"
        value={data.plannedPaymentCount}
        onChange={(v) => onChange('plannedPaymentCount', v)}
        type="number"
        suffix="回"
        disabled={readonly}
      />
      <EditableField
        label="予定代弁社数"
        value={data.plannedAgentCount}
        onChange={(v) => onChange('plannedAgentCount', v)}
        type="number"
        suffix="社"
        disabled={readonly}
      />
      <EditableField
        label="全和解書送付日"
        value={data.allSettlementDocSentDate}
        onChange={(v) => onChange('allSettlementDocSentDate', v)}
        type="date"
        disabled={readonly}
      />
    </div>
  )
}
