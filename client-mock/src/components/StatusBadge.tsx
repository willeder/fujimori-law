interface StatusBadgeProps {
  status: string | null | undefined
  size?: 'sm' | 'md'
}

const statusColors: Record<string, string> = {
  // 案件ステータス
  '全和解済_支払中': 'bg-green-100 text-green-700',
  '資格者面談待ち': 'bg-blue-100 text-blue-700',
  '和解交渉中': 'bg-amber-100 text-amber-700',
  'キャンセル': 'bg-red-100 text-red-700',
  '辞任': 'bg-slate-100 text-slate-600',
  // 債権者ステータス
  '受任通知発送待ち': 'bg-slate-100 text-slate-600',
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
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'

  return (
    <span className={`inline-block rounded-full font-medium ${colorClass} ${sizeClass}`}>
      {status}
    </span>
  )
}
