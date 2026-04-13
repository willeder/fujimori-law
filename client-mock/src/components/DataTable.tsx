import { useState } from 'react'

export interface Column<T> {
  key: keyof T | string
  header: string
  width?: string
  align?: 'left' | 'center' | 'right'
  /** false のときソート不可（通番列など） */
  sortable?: boolean
  render?: (item: T, index: number) => React.ReactNode
  /**
   * cellSingleLine 時のみ。false の列は … で切らない（操作列など）
   * 未指定は省略する
   */
  cellTruncate?: boolean
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyField: keyof T
  onRowClick?: (item: T) => void
  emptyMessage?: string
  /**
   * default: 通常
   * compact: 小さめフォント・詰め余白
   * dense: さらに一段小さく（一覧を画面幅に収めたいとき）
   */
  density?: 'default' | 'compact' | 'dense'
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
  /**
   * true のとき table-fixed のまま1行表示（折返しなし）。はみ出しは … で省略（列に cellTruncate:false で例外可）
   */
  cellSingleLine?: boolean
  /** cellSingleLine 時、true なら一時的に省略をやめる（行内編集中の入力が切れないようにする） */
  suspendTruncate?: boolean
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
  cellSingleLine = false,
  suspendTruncate = false,
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

  const isDense = density === 'dense'
  const isCompact = density === 'compact' || isDense
  const cellPad = isDense ? 'px-0.5 py-0.5' : isCompact ? 'px-1 py-0.5' : 'px-3 py-2'
  const headPad = isDense ? 'px-0.5 py-0.5' : isCompact ? 'px-1 py-1' : 'px-3 py-2'
  const tableText = isDense ? 'text-[9px] leading-tight' : isCompact ? 'text-[10px] leading-tight' : 'text-sm'
  const headText = isDense
    ? 'text-[8px] font-semibold leading-tight'
    : isCompact
      ? 'text-[9px] font-semibold leading-tight'
      : 'font-semibold'
  const emptyPad = isCompact ? 'px-2 py-6' : 'px-3 py-8'

  const scrollBody =
    bodyMaxHeightClassName != null && bodyMaxHeightClassName.length > 0

  const useStickyHeader = scrollBody || stickyHeader

  const stickyTh = useStickyHeader
    ? 'sticky top-0 z-20 bg-slate-50 shadow-[inset_0_-1px_0_0_theme(colors.slate.200)]'
    : ''

  /** 折り返し+table-auto 時は表がやや広がることがあるため横スクロールも許可 */
  const scrollWrapClass = scrollBody
    ? cellNoWrap
      ? `min-w-0 overflow-auto ${bodyMaxHeightClassName} isolate`
      : `min-w-0 overflow-auto ${bodyMaxHeightClassName} isolate`
    : `min-w-0 overflow-x-auto${stickyHeader ? ' isolate' : ''}`

  /** 横スクロール用の広い表のみ。折り返し表示（w-full）では付けない */
  const tableMinW = cellNoWrap ? ' min-w-max' : ''

  const tableBorder = useStickyHeader ? ' border-separate border-spacing-0' : ''

  const tableWidthClass = cellNoWrap ? 'w-max' : 'w-full'

  /**
   * cellSingleLine: 列％で均等化（table-fixed）
   * 折り返しモード: table-auto で幅指定・内容に応じた列幅（接触履歴・一覧で縦1文字折返しを防ぐ）
   */
  const tableLayoutClass = cellNoWrap ? '' : cellSingleLine ? ' table-fixed' : ' table-auto'

  const headCellWrap = cellNoWrap
    ? 'whitespace-nowrap'
    : cellSingleLine
      ? 'min-w-0 max-w-0 overflow-hidden whitespace-nowrap'
      : 'min-w-0 whitespace-normal break-words align-top'

  const bodyCellWrap = cellNoWrap
    ? 'whitespace-nowrap'
    : cellSingleLine
      ? 'min-w-0 max-w-0 overflow-hidden whitespace-nowrap'
      : 'min-w-0 whitespace-normal break-words align-top'

  /** table-fixed で列幅を守りつつ中身の min-content で列が膨らむのを防ぐ */
  const innerCellClassBase = 'min-w-0 max-w-full'

  return (
    <div className={scrollWrapClass}>
      <table className={`${tableWidthClass} ${tableText}${tableLayoutClass}${tableMinW}${tableBorder}`}>
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
                <div
                  className={
                    cellNoWrap
                      ? 'flex items-center gap-0.5'
                      : cellSingleLine
                        ? 'flex min-w-0 w-full items-center gap-0.5'
                        : 'flex min-w-0 w-full flex-wrap items-center gap-0.5'
                  }
                >
                  {cellNoWrap ? (
                    col.header
                  ) : (
                    <span
                      className={
                        cellSingleLine ? 'min-w-0 flex-1 truncate' : 'min-w-0 flex-1'
                      }
                    >
                      {col.header}
                    </span>
                  )}
                  {sortable && sortKey === String(col.key) && (
                    <span className="shrink-0 text-blue-500">
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
                className={`${emptyPad} text-center text-slate-400 ${cellNoWrap || cellSingleLine ? '' : 'max-w-none whitespace-normal'}`}
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
                {columns.map((col) => {
                  const innerClass =
                    !cellSingleLine
                      ? innerCellClassBase
                      : suspendTruncate
                        ? `${innerCellClassBase} whitespace-nowrap`
                        : col.cellTruncate === false
                          ? `${innerCellClassBase} whitespace-nowrap`
                          : `${innerCellClassBase} truncate`
                  return (
                  <td
                    key={String(col.key)}
                    className={`${cellPad} ${alignClass[col.align ?? 'left']} ${bodyCellWrap} tabular-nums`}
                  >
                    {cellNoWrap ? (
                      col.render
                        ? col.render(item, index)
                        : formatValue(getValue(item, String(col.key)))
                    ) : (
                      <div className={innerClass}>
                        {col.render
                          ? col.render(item, index)
                          : formatValue(getValue(item, String(col.key)))}
                      </div>
                    )}
                  </td>
                  )
                })}
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
