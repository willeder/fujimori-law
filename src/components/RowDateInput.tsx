/**
 * 表の行編集で使う日付欄。
 *
 * 事務所からのご指摘（2026-09-04）:
 *   「入金スケジュールで該当行の編集を押し、日付フィールドを選んでデリートを
 *     押しても消えない。フィールド内の数値等を削除することは多々あるため、
 *     編集ボタン押下時の挙動を確認してほしい」
 *
 * 原因はブラウザ標準の <input type="date"> を使っていたこと。標準の日付欄は
 * 「年／月／日」が別々の枠になっていて、Delete では**いま選んでいる枠しか
 * 消えない**。1回押すと「年/09/0」のように中途半端な見た目のまま残るので、
 * 消えていないように見える（実際には値は空になっている）。
 * 全部消すには枠を移動しながら3回押す必要があり、消せたかどうかも分からない。
 *
 * 案件詳細の項目欄は、同じ理由で既に打ち込み式（DateTextInput）へ
 * 置き換え済みだった（藤川様 2026-08-08「Chrome の年欄が6桁入る」）。
 * 表の行編集だけが標準のままだったので、そちらへ揃える。
 *
 * これで Delete / BackSpace / 選択して上書き のいずれでも普通に消せる。
 * 打ち込みは数字8桁（20260928 → 2026-09-28）、右のアイコンからカレンダーも使える。
 */
import { DateTextInput } from './DateTextInput'

type Props = {
  value: string | null | undefined
  /** 空にしたときは null が渡る */
  onChange: (next: string | null) => void
  className?: string
}

export function RowDateInput({ value, onChange, className }: Props) {
  const set = (v: string) => onChange(v === '' ? null : v)
  return (
    <DateTextInput
      value={value ?? ''}
      onChange={set}
      onPick={set}
      className={className}
      grow
    />
  )
}
