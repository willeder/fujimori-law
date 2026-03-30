/**
 * 依頼者基本情報コンポーネント
 */
import { EditableField } from '../EditableField'
import type { ClientBasicInfo as ClientBasicInfoType } from '../../types'

interface ClientBasicInfoProps {
  data: ClientBasicInfoType
  onChange: (field: keyof ClientBasicInfoType, value: string) => void
  readonly?: boolean
}

export function ClientBasicInfo({ data, onChange, readonly = false }: ClientBasicInfoProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <EditableField
        label="氏名"
        value={data.name}
        onChange={(v) => onChange('name', v)}
        disabled={readonly}
      />
      <EditableField
        label="フリガナ"
        value={data.furigana}
        onChange={(v) => onChange('furigana', v)}
        disabled={readonly}
      />
      <EditableField
        label="電話番号"
        value={data.phone}
        onChange={(v) => onChange('phone', v)}
        disabled={readonly}
      />
      <EditableField
        label="メールアドレス"
        value={data.email}
        onChange={(v) => onChange('email', v)}
        disabled={readonly}
      />
      <EditableField
        label="都道府県"
        value={data.prefecture}
        onChange={(v) => onChange('prefecture', v)}
        disabled={readonly}
      />
      <EditableField
        label="住所"
        value={data.address}
        onChange={(v) => onChange('address', v)}
        disabled={readonly}
      />
      <EditableField
        label="生年月日"
        value={data.birthDate}
        onChange={(v) => onChange('birthDate', v)}
        type="date"
        disabled={readonly}
      />
      <EditableField
        label="年齢"
        value={data.age}
        onChange={(v) => onChange('age', v)}
        type="number"
        suffix="歳"
        disabled={readonly}
      />
      <EditableField
        label="性別"
        value={data.gender}
        onChange={(v) => onChange('gender', v)}
        type="select"
        options={[
          { value: '男', label: '男' },
          { value: '女', label: '女' },
        ]}
        disabled={readonly}
      />
      <EditableField
        label="婚姻状況"
        value={data.maritalStatus}
        onChange={(v) => onChange('maritalStatus', v)}
        type="select"
        options={[
          { value: '既婚', label: '既婚' },
          { value: '未婚', label: '未婚' },
          { value: '離婚', label: '離婚' },
        ]}
        disabled={readonly}
      />
      <EditableField
        label="子供"
        value={data.children}
        onChange={(v) => onChange('children', v)}
        disabled={readonly}
      />
      <EditableField
        label="居住形態"
        value={data.residenceType}
        onChange={(v) => onChange('residenceType', v)}
        type="select"
        options={[
          { value: '持家(ﾛｰﾝ無)', label: '持家（ローン無）' },
          { value: '持家(ﾛｰﾝ有)', label: '持家（ローン有）' },
          { value: '賃貸', label: '賃貸' },
          { value: '社宅', label: '社宅' },
          { value: '実家', label: '実家' },
        ]}
        disabled={readonly}
      />
      <EditableField
        label="家賃"
        value={data.rent}
        onChange={(v) => onChange('rent', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="月収（手取り）"
        value={data.monthlyIncome}
        onChange={(v) => onChange('monthlyIncome', v)}
        type="number"
        suffix="円"
        disabled={readonly}
      />
      <EditableField
        label="給与日"
        value={data.payDay}
        onChange={(v) => onChange('payDay', v)}
        disabled={readonly}
      />
      <EditableField
        label="勤務形態"
        value={data.employmentType}
        onChange={(v) => onChange('employmentType', v)}
        type="select"
        options={[
          { value: '会社員・公務員', label: '会社員・公務員' },
          { value: 'バイト(パート)・派遣', label: 'バイト（パート）・派遣' },
          { value: '自営・会社経営', label: '自営・会社経営' },
          { value: '無職', label: '無職' },
        ]}
        disabled={readonly}
      />
      <EditableField
        label="要注意ランク"
        value={data.cautionRank}
        onChange={(v) => onChange('cautionRank', v)}
        type="select"
        options={[
          { value: 'A', label: 'A' },
          { value: 'B', label: 'B' },
          { value: 'C', label: 'C' },
        ]}
        disabled={readonly}
      />
    </div>
  )
}
