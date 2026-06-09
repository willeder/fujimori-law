/**
 * 入金情報コンポーネント
 */
import { EditableField } from '../EditableField'
import type { PaymentInfo as PaymentInfoType } from '../../types'

interface PaymentInfoProps {
  data: PaymentInfoType
  onChange: (field: keyof PaymentInfoType, value: string) => void
  readonly?: boolean
}

export function PaymentInfo({ data, onChange, readonly = false }: PaymentInfoProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <EditableField
        label="初回入金予定日"
        value={data.firstPaymentDate}
        onChange={(v) => onChange('firstPaymentDate', v)}
        type="date"
        disabled={readonly}
      />
      <EditableField
        label="初回入金額"
        value={data.firstPaymentAmount}
        onChange={(v) => onChange('firstPaymentAmount', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="10日以内"
        value={data.firstPaymentWithinTenDays}
        onChange={(v) => onChange('firstPaymentWithinTenDays', v)}
        disabled={readonly}
      />
      <EditableField
        label="毎月入金日"
        value={data.monthlyPaymentDay}
        onChange={(v) => onChange('monthlyPaymentDay', v)}
        disabled={readonly}
      />
      <EditableField
        label="基本入金額"
        value={data.basePaymentAmount}
        onChange={(v) => onChange('basePaymentAmount', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="次回入金日"
        value={data.nextPaymentDate}
        onChange={(v) => onChange('nextPaymentDate', v)}
        type="date"
        disabled={readonly}
      />
      <div />
      <EditableField
        label="累計入金金額"
        value={data.cumulativePaymentAmount}
        onChange={(v) => onChange('cumulativePaymentAmount', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="累計入金予定額"
        value={data.cumulativePlannedPayment}
        onChange={(v) => onChange('cumulativePlannedPayment', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="累計報酬充当額"
        value={data.cumulativeFeeAllocation}
        onChange={(v) => onChange('cumulativeFeeAllocation', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="累計報酬充当予定額"
        value={data.cumulativePlannedFeeAllocation}
        onChange={(v) => onChange('cumulativePlannedFeeAllocation', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="累計プール充当額"
        value={data.cumulativePoolAllocation}
        onChange={(v) => onChange('cumulativePoolAllocation', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="累計弁済充当額"
        value={data.cumulativeRepaymentAllocation}
        onChange={(v) => onChange('cumulativeRepaymentAllocation', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="総額-プール-累弁済"
        value={data.totalMinusPoolMinusRepayment}
        onChange={(v) => onChange('totalMinusPoolMinusRepayment', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
    </div>
  )
}
