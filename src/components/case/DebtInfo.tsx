/**
 * 債務情報コンポーネント
 */
import { EditableField } from '../EditableField'
import type { DebtInfo as DebtInfoType } from '../../types'

interface DebtInfoProps {
  data: DebtInfoType
  onChange: (field: keyof DebtInfoType, value: string) => void
  readonly?: boolean
}

export function DebtInfo({ data, onChange, readonly = false }: DebtInfoProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <EditableField
        label="債権社数"
        value={data.creditorCount}
        onChange={(v) => onChange('creditorCount', v)}
        type="number"
        suffix="社"
        disabled={readonly}
      />
      <EditableField
        label="申告債務額"
        value={data.declaredDebtAmount}
        onChange={(v) => onChange('declaredDebtAmount', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="債務額総額"
        value={data.totalDebtAmount}
        onChange={(v) => onChange('totalDebtAmount', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="依頼前返済額"
        value={data.preRequestPayment}
        onChange={(v) => onChange('preRequestPayment', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="依頼後返済額"
        value={data.postRequestPayment}
        onChange={(v) => onChange('postRequestPayment', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
    </div>
  )
}
