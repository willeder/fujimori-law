/**
 * 入金サマリコンポーネント
 */
import { EditableField } from '../EditableField'
import type { PaymentInfo } from '../../types'

interface PaymentSummaryProps {
  paymentInfo: PaymentInfo
  onChange: (field: keyof PaymentInfo, value: string) => void
  readonly?: boolean
}

export function PaymentSummary({ paymentInfo, onChange, readonly = false }: PaymentSummaryProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">累計入金額</span>
        <span className="text-xl font-bold text-blue-600">
          {paymentInfo.cumulativePaymentAmount?.toLocaleString()}
          <span className="text-sm font-normal text-slate-400 ml-1">円</span>
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">予定額</span>
        <span>{paymentInfo.cumulativePlannedPayment?.toLocaleString()}円</span>
      </div>

      <hr className="border-slate-100" />

      <EditableField
        label="次回入金日"
        value={paymentInfo.nextPaymentDate}
        onChange={(v) => onChange('nextPaymentDate', v)}
        type="date"
        disabled={readonly}
      />

      <EditableField
        label="基本入金額"
        value={paymentInfo.basePaymentAmount}
        onChange={(v) => onChange('basePaymentAmount', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
    </div>
  )
}
