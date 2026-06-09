/**
 * 報酬情報コンポーネント
 */
import { EditableField } from '../EditableField'
import type { FeeInfo as FeeInfoType } from '../../types'

interface FeeInfoProps {
  data: FeeInfoType
  onChange: (field: keyof FeeInfoType, value: string) => void
  readonly?: boolean
}

export function FeeInfo({ data, onChange, readonly = false }: FeeInfoProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <EditableField
        label="通常報酬"
        value={data.normalFee}
        onChange={(v) => onChange('normalFee', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="事務所報酬（通常）"
        value={data.officeFee}
        onChange={(v) => onChange('officeFee', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="報酬分割回数"
        value={data.installmentCount}
        onChange={(v) => onChange('installmentCount', v)}
        type="number"
        suffix="回"
        disabled={readonly}
      />
      <EditableField
        label="弁済代行"
        value={data.agentPayment}
        onChange={(v) => onChange('agentPayment', v)}
        type="select"
        options={[
          { value: 'あり', label: 'あり' },
          { value: 'なし', label: 'なし' },
        ]}
        disabled={readonly}
      />
      <EditableField
        label="予定弁済報酬総額"
        value={data.plannedPaymentFeeTotal}
        onChange={(v) => onChange('plannedPaymentFeeTotal', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="報酬未回収額"
        value={data.uncollectedFee}
        onChange={(v) => onChange('uncollectedFee', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
    </div>
  )
}
