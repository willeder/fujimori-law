import { useEffect, useState } from 'react'

export interface Column<T> {
  key: keyof T | string
  header: string
  width?: string
  align?: 'left' | 'center' | 'right'
  /** ヘッダー（th）の追加クラス（列ごとの背景色など） */
  headerClassName?: string
  /** セル（td）の追加クラス（列ごとの背景色など） */
  cellClassName?: string
  /** false のときソート不可（通番列など） */
  sortable?: boolean
  render?: (item: T, index: number) => React.ReactNode
  /**
   * cellSingleLine 時のみ。false の列は … で切らない（操作列など）
   * 未指定は省略する
   */
  cellTruncate?: boolean
  /**
   * cellSingleLine 時のみ。true の列は複数行表示を許可（コメント欄など）
   * whitespace-pre-wrap で改行を保持
   */
  cellMultiline?: boolean
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyField: keyof T
  onRowClick?: (item: T) => void
  emptyMessage?: string
  /** 行ごとのクラス名を返す関数（背景色など） */
  getRowClassName?: (item: T, index: number) => string
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
  /** 余白をさらに詰める（入金スケジュールなど超高密度表示向け） */
  tight?: boolean
  /** true のとき thead の縦余白のみ一段詰める（見出し行の高さを抑える） */
  slimHeader?: boolean
  /** true のとき 50/100 件のページネーション（表示件数切替＋前後送り）を表示 */
  paginated?: boolean
  /** ページネーション時の初期表示件数（既定 50） */
  defaultPageSize?: number
}

export function DataTable<T>({
  data,
  columns,
  keyField,
  onRowClick,
  emptyMessage = 'データがありません',
  getRowClassName,
  density = 'default',
  bodyMaxHeightClassName,
  stickyHeader = false,
  cellNoWrap = false,
  cellSingleLine = false,
  suspendTruncate = false,
  tight = false,
  slimHeader = false,
  paginated = false,
  defaultPageSize = 50,
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

  // ── ページネーション ──
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(defaultPageSize)
  const total = sortedData.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  // 件数・表示件数が変わったら1ページ目へ（絞り込み変更時など）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [total, pageSize])
  const pageData = paginated
    ? sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedData

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
  const cellPad = isDense
    ? tight
      ? 'px-0 py-px'
      : 'px-0.5 py-0.5'
    : isCompact
      ? tight
        ? 'px-px py-px'
        : 'px-1 py-0.5'
      : tight
        ? 'px-1 py-0.5'
        : 'px-2 py-1'
  const headPad = isDense
    ? tight
      ? slimHeader
        ? 'px-0 py-px'
        : 'px-0 py-0.5'
      : slimHeader
        ? 'px-0.5 py-px'
        : 'px-0.5 py-0.5'
    : isCompact
      ? tight
        ? slimHeader
          ? 'px-0.5 py-px'
          : 'px-0.5 py-0.5'
        : slimHeader
          ? 'px-1 py-0.5'
          : 'px-1 py-1'
      : tight
        ? slimHeader
          ? 'px-1 py-px'
          : 'px-1 py-0.5'
        : slimHeader
          ? 'px-2 py-0.5'
          : 'px-2 py-1'
  const tableText = isDense ? 'text-[10px] leading-tight' : isCompact ? 'text-[11px] leading-tight' : 'text-xs'
  const headText = isDense
    ? 'text-[9px] font-semibold leading-tight'
    : isCompact
      ? 'text-[10px] font-semibold leading-tight'
      : slimHeader
        ? 'text-[11px] font-semibold leading-tight'
        : 'text-[11px] font-semibold'
  const emptyPad = isCompact ? 'px-2 py-4' : 'px-2 py-6'

  const scrollBody =
    bodyMaxHeightClassName != null && bodyMaxHeightClassName.length > 0

  const useStickyHeader = scrollBody || stickyHeader || paginated

  const stickyTh = useStickyHeader
    ? 'sticky top-0 z-20 bg-white shadow-[inset_0_-1px_0_0_theme(colors.slate.200)]'
    : ''

  /**
   * 折り返し+table-auto 時は表がやや広がることがあるため横スクロールも許可
   * stickyHeader を親スクロールコンテナで使う場合は overflow を設定せず
   * スクロールを親に委譲（sticky が親コンテナ基準で動作）
   */
  const scrollWrapClass = scrollBody
    ? cellNoWrap
      ? `min-w-0 overflow-auto ${bodyMaxHeightClassName} isolate`
      : `min-w-0 overflow-auto ${bodyMaxHeightClassName} isolate`
    : stickyHeader
      ? 'isolate'
      : 'min-w-0 overflow-x-auto'

  /** 横スクロール用の広い表のみ。折り返し表示（w-full）では付けない */
  const tableMinW = cellNoWrap ? ' min-w-max' : ''

  const tableBorder = useStickyHeader ? ' border-separate border-spacing-0' : ''

  /** w-full + table-auto でコンテナ幅いっぱいに拡張、列は内容に応じて自動調整 */
  const tableWidthClass = cellNoWrap ? 'w-max' : 'w-full'

  /**
   * cellSingleLine: 列％で均等化（table-fixed）
   * 折り返しモード: table-auto で幅指定・内容に応じた列幅（接触履歴・一覧で縦1文字折返しを防ぐ）
   */
  const tableLayoutClass = cellNoWrap ? '' : cellSingleLine ? ' table-fixed' : ' table-auto'

  const headCellWrap = cellNoWrap
    ? 'whitespace-nowrap'
    : cellSingleLine
      ? 'overflow-hidden whitespace-nowrap'
      : 'min-w-0 whitespace-normal break-words align-top'

  const bodyCellWrap = cellNoWrap
    ? 'whitespace-nowrap'
    : cellSingleLine
      ? 'overflow-hidden whitespace-nowrap'
      : 'min-w-0 whitespace-normal break-words align-top'

  /** table-fixed で列幅を守りつつ中身の min-content で列が膨らむのを防ぐ */
  const innerCellClassBase = 'min-w-0 max-w-full'

  const pager =
    paginated && total > 0 ? (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span>
          {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} / {total}件
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            表示件数
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50 disabled:opacity-40"
          >
            前へ
          </button>
          <span>
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50 disabled:opacity-40"
          >
            次へ
          </button>
        </div>
      </div>
    ) : null

  const bodyScrollClass = paginated
    ? `min-w-0 overflow-auto isolate ${bodyMaxHeightClassName ?? 'max-h-[calc(100vh-13rem)]'}`
    : scrollWrapClass

  return (
    <div className={paginated ? 'flex min-h-0 flex-col' : ''}>
      {pager}
    <div className={bodyScrollClass}>
      <table className={`${tableWidthClass} ${tableText}${tableLayoutClass}${tableMinW}${tableBorder}`}>
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((col) => {
              const sortable = col.sortable !== false
              return (
              <th
                key={String(col.key)}
                className={`${headPad} ${headText} text-slate-600 ${alignClass[col.align ?? 'left']} ${sortable ? 'cursor-pointer hover:bg-slate-100' : ''} ${headCellWrap} ${stickyTh} ${col.headerClassName ?? ''}`}
                style={{ width: col.width }}
                onClick={() => sortable && handleSort(String(col.key))}
              >
                <div
                  className={
                    cellNoWrap
                      ? `flex items-center ${tight ? 'gap-0' : 'gap-0.5'}`
                      : cellSingleLine
                        ? `flex min-w-0 w-full items-center ${tight ? 'gap-0' : 'gap-0.5'}`
                        : `flex min-w-0 w-full flex-wrap items-center ${tight ? 'gap-0' : 'gap-0.5'}`
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
            pageData.map((item, index) => {
              const customRowClass = getRowClassName?.(item, index) ?? ''
              return (
              <tr
                key={String(getValue(item, String(keyField)))}
                className={`border-b border-slate-100 ${onRowClick ? 'cursor-pointer hover:bg-blue-50' : ''} ${index % 2 === 1 && !customRowClass ? 'bg-slate-200/50' : ''} ${customRowClass}`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => {
                  const innerClass =
                    !cellSingleLine
                      ? innerCellClassBase
                      : suspendTruncate
                        ? `${innerCellClassBase} whitespace-nowrap`
                        : col.cellMultiline
                          ? `${innerCellClassBase} whitespace-pre-wrap break-words`
                          : col.cellTruncate === false
                            ? `${innerCellClassBase} whitespace-nowrap`
                            : `${innerCellClassBase} truncate`
                  return (
                  <td
                    key={String(col.key)}
                    className={`${cellPad} ${alignClass[col.align ?? 'left']} ${bodyCellWrap} tabular-nums ${col.cellClassName ?? ''}`}
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
              )
            })
          )}
        </tbody>
      </table>
    </div>
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
