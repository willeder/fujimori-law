interface StatusBadgeProps {
  status: string | null | undefined
  size?: 'sm' | 'md'
}

const statusColors: Record<string, string> = {
  // 案件ステータス（受任後ステータス）— kintone の選択肢14種に対応。
  // 進行中=青系 / 完了=緑系 / 破産手続=紫系 / 終了(離脱)=赤・グレー系 で色分けする。
  // ※「受任通知発送待ち」は債権者ステータスと同名のため、下の共通定義に集約
  '全社受任通知発送済': 'bg-sky-100 text-sky-700',
  '一部受任通知発送済': 'bg-cyan-100 text-cyan-700',
  '破産申立待ち': 'bg-purple-100 text-purple-700',
  '破産申立済': 'bg-violet-100 text-violet-700',
  '免責済': 'bg-teal-100 text-teal-700',
  'キャンセル': 'bg-red-100 text-red-700',
  'キャンセル（要報酬回収）': 'bg-red-200 text-red-800',
  '辞任': 'bg-slate-100 text-slate-600',
  '辞任（報酬回収後）': 'bg-slate-200 text-slate-700',
  '辞任（要報酬回収）': 'bg-orange-100 text-orange-700',
  '資格者面談待ち': 'bg-indigo-100 text-indigo-700',
  '全和解済_支払中': 'bg-green-100 text-green-700',
  '全和解済_完済': 'bg-emerald-100 text-emerald-700',
  // 債権者ステータス（kintone の値に合わせている）
  '受任通知発送待ち': 'bg-slate-100 text-slate-600',
  '債権調査票待ち': 'bg-amber-100 text-amber-700',
  '求償先調査票待ち': 'bg-amber-50 text-amber-700',
  // 時効援用のルート（和解とは別系統なのでオレンジ系で区別する）
  // ※ この4つは kintone のフォーム定義にまだ無い（事務所のご要望分）。
  //   kintone に追加されたら fieldOptions の選択肢にも足す。色は先に用意しておく。
  '援用通知作成待ち': 'bg-orange-50 text-orange-700',
  '援用通知発送待ち': 'bg-orange-100 text-orange-700',
  '援用通知発送済': 'bg-orange-200 text-orange-800',
  '和解提案書作成待ち': 'bg-purple-50 text-purple-700',
  '和解提案書作成済': 'bg-purple-100 text-purple-800',
  '和解提案書発送待ち': 'bg-purple-100 text-purple-700',
  '和解提案書発送済': 'bg-violet-100 text-violet-700',
  '和解再提案待ち': 'bg-rose-100 text-rose-700',
  '和解稟議中': 'bg-fuchsia-100 text-fuchsia-700',
  '和解済': 'bg-green-100 text-green-700',
  '和解後返済中': 'bg-green-200 text-green-800',
  '弁護士和解済 返済中': 'bg-emerald-100 text-emerald-700',
  '和解後完済済': 'bg-teal-100 text-teal-700',
  '弁護士引継ぎ待ち': 'bg-sky-100 text-sky-700',
  '弁護士引継ぎ済': 'bg-sky-200 text-sky-800',
  '受任対象外': 'bg-black text-white',
  // 受任ランク
  'A': 'bg-green-100 text-green-700',
  'B': 'bg-amber-100 text-amber-700',
  'C': 'bg-red-100 text-red-700',
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  if (!status) {
    return null
  }

  const colorClass = statusColors[status] ?? 'bg-slate-100 text-slate-600'
  const sizeClass = size === 'sm' ? 'text-[0.625rem] px-1.5 py-px' : 'text-[0.6875rem] px-2 py-0.5'

  return (
    <span className={`inline-block rounded-full font-medium ${colorClass} ${sizeClass}`}>
      {status}
    </span>
  )
}
