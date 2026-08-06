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
  // 債権者ステータス
  '受任通知発送待ち': 'bg-slate-100 text-slate-600',
  '受任対象外': 'bg-black text-white',
  '受任通知発送済': 'bg-blue-100 text-blue-700',
  '債権調査中': 'bg-amber-100 text-amber-700',
  '和解提案中': 'bg-purple-100 text-purple-700',
  '和解済': 'bg-green-100 text-green-700',
  '弁済中': 'bg-emerald-100 text-emerald-700',
  '完済': 'bg-teal-100 text-teal-700',
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
  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5'

  return (
    <span className={`inline-block rounded-full font-medium ${colorClass} ${sizeClass}`}>
      {status}
    </span>
  )
}
