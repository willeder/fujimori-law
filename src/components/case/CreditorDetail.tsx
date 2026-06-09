/**
 * 債権者詳細コンポーネント
 */
import { EditableField, StatusBadge } from '../index'
import type { Creditor } from '../../types'

interface CreditorDetailProps {
  creditor: Creditor
  onChange: (field: keyof Creditor, value: string | number | null) => void
  readonly?: boolean
}

export function CreditorDetail({ creditor, onChange, readonly = false }: CreditorDetailProps) {
  const isSettled = ['和解済', '弁済中', '完済'].includes(creditor.status)

  return (
    <div className="space-y-3">
      {/* ステータス */}
      <div className="flex items-center gap-4">
        <StatusBadge status={creditor.status} size="md" />
        <span className="text-sm text-slate-500">
          交渉相手: {creditor.negotiationPartner ?? '直接'}
        </span>
      </div>

      {/* 債権情報 */}
      <div className="grid grid-cols-3 gap-4">
        <EditableField
          label="申告額"
          value={creditor.declaredAmount}
          onChange={(v) => onChange('declaredAmount', Number(v) || null)}
          type="number"
          suffix="円"
          disabled={readonly}
        />
        <EditableField
          label="債務額"
          value={creditor.debtAmount}
          onChange={(v) => onChange('debtAmount', Number(v) || null)}
          type="number"
          suffix="円"
          disabled={readonly}
        />
        <EditableField
          label="想定和解（%）"
          value={creditor.expectedSettlement}
          onChange={(v) => onChange('expectedSettlement', Number(v) || null)}
          type="number"
          suffix="%"
          disabled={readonly}
        />
      </div>

      {/* 進行状況 */}
      <div className="grid grid-cols-3 gap-4">
        <EditableField
          label="ステータス"
          value={creditor.status}
          onChange={(v) => onChange('status', v)}
          type="select"
          options={[
            { value: '受任通知発送待ち', label: '受任通知発送待ち' },
            { value: '受任通知発送済', label: '受任通知発送済' },
            { value: '債権調査中', label: '債権調査中' },
            { value: '和解提案中', label: '和解提案中' },
            { value: '和解済', label: '和解済' },
            { value: '弁済中', label: '弁済中' },
            { value: '完済', label: '完済' },
          ]}
          disabled={readonly}
        />
        <EditableField
          label="受任通知送付日"
          value={creditor.acceptanceNoticeSentDate}
          onChange={(v) => onChange('acceptanceNoticeSentDate', v || null)}
          type="date"
          disabled={readonly}
        />
        <EditableField
          label="次回処理日時"
          value={creditor.nextProcessDate}
          onChange={(v) => onChange('nextProcessDate', v || null)}
          type="date"
          disabled={readonly}
        />
      </div>

      {/* 和解内容（和解済みの場合） */}
      {isSettled && (
        <>
          <hr className="border-slate-200" />
          <h4 className="font-medium text-slate-700">和解内容</h4>
          <div className="grid grid-cols-3 gap-4">
            <EditableField
              label="和解日"
              value={creditor.settlementDate}
              onChange={(v) => onChange('settlementDate', v || null)}
              type="date"
              disabled={readonly}
            />
            <EditableField
              label="和解金額"
              value={creditor.settlementAmount}
              onChange={(v) => onChange('settlementAmount', Number(v) || null)}
              type="number"
              suffix="円"
              disabled={readonly}
            />
            <EditableField
              label="支払回数"
              value={creditor.paymentCount}
              onChange={(v) => onChange('paymentCount', Number(v) || null)}
              type="number"
              suffix="回"
              disabled={readonly}
            />
            <EditableField
              label="支払開始月"
              value={creditor.paymentStartMonth}
              onChange={(v) => onChange('paymentStartMonth', v || null)}
              disabled={readonly}
            />
            <EditableField
              label="支払日"
              value={creditor.paymentDay}
              onChange={(v) => onChange('paymentDay', Number(v) || null)}
              type="number"
              suffix="日"
              disabled={readonly}
            />
            <EditableField
              label="将来利息"
              value={creditor.futureInterest}
              onChange={(v) => onChange('futureInterest', v || null)}
              type="select"
              options={[
                { value: 'なし', label: 'なし' },
                { value: 'あり', label: 'あり' },
              ]}
              disabled={readonly}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <EditableField
              label="初回支払額"
              value={creditor.firstPaymentAmount}
              onChange={(v) => onChange('firstPaymentAmount', Number(v) || null)}
              type="number"
              suffix="円"
              disabled={readonly}
            />
            <EditableField
              label="２回目以降支払額"
              value={creditor.subsequentPaymentAmount}
              onChange={(v) => onChange('subsequentPaymentAmount', Number(v) || null)}
              type="number"
              suffix="円"
              disabled={readonly}
            />
            <EditableField
              label="最終支払額"
              value={creditor.finalPaymentAmount}
              onChange={(v) => onChange('finalPaymentAmount', Number(v) || null)}
              type="number"
              suffix="円"
              disabled={readonly}
            />
          </div>

          <h4 className="font-medium text-slate-700 mt-4">振込先情報</h4>
          <div className="grid grid-cols-3 gap-4">
            <EditableField
              label="銀行名"
              value={creditor.bankName}
              onChange={(v) => onChange('bankName', v || null)}
              disabled={readonly}
            />
            <EditableField
              label="支店名"
              value={creditor.branchName}
              onChange={(v) => onChange('branchName', v || null)}
              disabled={readonly}
            />
            <EditableField
              label="口座種別"
              value={creditor.accountType}
              onChange={(v) => onChange('accountType', v || null)}
              type="select"
              options={[
                { value: '普通', label: '普通' },
                { value: '当座', label: '当座' },
              ]}
              disabled={readonly}
            />
            <EditableField
              label="口座番号"
              value={creditor.accountNumber}
              onChange={(v) => onChange('accountNumber', v || null)}
              disabled={readonly}
            />
            <EditableField
              label="口座名義"
              value={creditor.accountHolder}
              onChange={(v) => onChange('accountHolder', v || null)}
              disabled={readonly}
            />
          </div>
        </>
      )}
    </div>
  )
}
