import { useState } from 'react'

export interface Column<T> {
  key: keyof T | string
  header: string
  width?: string
  align?: 'left' | 'center' | 'right'
  /** false のときソート不可（通番列など） */
  sortable?: boolean
  render?: (item: T, index: number) => React.ReactNode
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyField: keyof T
  onRowClick?: (item: T) => void
  emptyMessage?: string
  /** compact: 小さめフォント・詰め余白（横スクロール前提の表向け） */
  density?: 'default' | 'compact'
  /**
   * 指定時はこの高さで縦スクロールし、ヘッダー行は sticky で固定（tbody のみスクロール相当）
   * 例: max-h-[min(45vh,22rem)]
   */
  bodyMaxHeightClassName?: string
  /**
   * true のときヘッダー行を sticky にする（親が縦スクロールのとき用。bodyMaxHeightClassName 未指定でも可）
   */
  stickyHeader?: boolean
  /**
   * true のとき th/td は折り返さず1行。表幅は内容に合わせ（w-max）横スクロールで閲覧（入金スケジュール等）
   */
  cellNoWrap?: boolean
}

export function DataTable<T>({
  data,
  columns,
  keyField,
  onRowClick,
  emptyMessage = 'データがありません',
  density = 'default',
  bodyMaxHeightClassName,
  stickyHeader = false,
  cellNoWrap = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey) return 0
    const aVal = (a as Record<string, unknown>)[sortKey]
    const bVal = (b as Record<string, unknown>)[sortKey]
    if (aVal === bVal) return 0
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1
    const comparison = aVal < bVal ? -1 : 1
    return sortOrder === 'asc' ? comparison : -comparison
  })

  const getValue = (item: T, key: string): unknown => {
    return (item as Record<string, unknown>)[key]
  }

  const alignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }

  const isCompact = density === 'compact'
  const cellPad = isCompact ? 'px-1 py-0.5' : 'px-3 py-2'
  const headPad = isCompact ? 'px-1 py-1' : 'px-3 py-2'
  const tableText = isCompact ? 'text-[10px] leading-tight' : 'text-sm'
  const headText = isCompact ? 'text-[9px] font-semibold leading-tight' : 'font-semibold'
  const emptyPad = isCompact ? 'px-2 py-6' : 'px-3 py-8'

  const scrollBody =
    bodyMaxHeightClassName != null && bodyMaxHeightClassName.length > 0

  const useStickyHeader = scrollBody || stickyHeader

  const stickyTh = useStickyHeader
    ? 'sticky top-0 z-20 bg-slate-50 shadow-[inset_0_-1px_0_0_theme(colors.slate.200)]'
    : ''

  const scrollWrapClass = scrollBody
    ? `min-w-0 overflow-auto ${bodyMaxHeightClassName} isolate`
    : `min-w-0 overflow-x-auto${stickyHeader ? ' isolate' : ''}`

  const tableMinW = isCompact || scrollBody || stickyHeader || cellNoWrap ? ' min-w-max' : ''

  const tableBorder = useStickyHeader ? ' border-separate border-spacing-0' : ''

  const tableWidthClass = cellNoWrap ? 'w-max' : 'w-full'

  const headCellWrap = cellNoWrap
    ? 'whitespace-nowrap'
    : 'min-w-0 whitespace-normal break-words'

  const bodyCellWrap = cellNoWrap
    ? 'whitespace-nowrap'
    : 'min-w-0 whitespace-normal break-words'

  return (
    <div className={scrollWrapClass}>
      <table className={`${tableWidthClass} ${tableText}${tableMinW}${tableBorder}`}>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((col) => {
              const sortable = col.sortable !== false
              return (
              <th
                key={String(col.key)}
                className={`${headPad} ${headText} text-slate-600 ${alignClass[col.align ?? 'left']} ${sortable ? 'cursor-pointer hover:bg-slate-100' : ''} ${headCellWrap} ${stickyTh}`}
                style={{ width: col.width }}
                onClick={() => sortable && handleSort(String(col.key))}
              >
                <div className="flex items-center gap-0.5">
                  {col.header}
                  {sortable && sortKey === String(col.key) && (
                    <span className="text-blue-500">
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className={`${emptyPad} text-center text-slate-400`}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((item, index) => (
              <tr
                key={String(getValue(item, String(keyField)))}
                className={`border-b border-slate-100 ${onRowClick ? 'cursor-pointer hover:bg-blue-50' : ''} ${index % 2 === 1 ? 'bg-slate-50/50' : ''}`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={`${cellPad} ${alignClass[col.align ?? 'left']} ${bodyCellWrap} tabular-nums`}
                  >
                    {col.render
                      ? col.render(item, index)
                      : formatValue(getValue(item, String(col.key)))}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function formatValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-slate-300">-</span>
  }
  if (typeof value === 'number') {
    return value.toLocaleString()
  }
  return String(value)
}
