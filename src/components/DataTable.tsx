import { useEffect, useRef, useState } from 'react'

// 1画面に複数のテーブルがある場合（案件詳細など）に Shift+F が全テーブルを
// 同時にトグルしないよう、「いま操作対象のテーブル」を1つだけ保持する簡易レジストリ。
// 直近にホバー/フォーカスしたテーブルがアクティブになり、Shift+F はそのテーブルだけに効く。
let __activeFindTable: number | null = null
let __findTableSeq = 0

// 検索条件の数値比較パーサ。 ">=1000000" / "<50000" / "=0" / "10000..50000" 等。
// カンマ・「円」・空白・全角符号(≥≤)を許容。数値比較でなければ null（→部分一致にフォールバック）。
type NumCriterion =
  | { op: '>' | '<' | '>=' | '<=' | '='; n: number }
  | { op: 'range'; n: number; n2: number }
function parseNumericCriterion(v: string): NumCriterion | null {
  const t = v
    .replace(/[,，\s円]/g, '')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[〜～]/g, '..')
  let m = t.match(/^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/)
  if (m) return { op: 'range', n: Number(m[1]), n2: Number(m[2]) }
  m = t.match(/^(>=|<=|>|<|=)(-?\d+(?:\.\d+)?)$/)
  if (m) return { op: m[1] as '>' | '<' | '>=' | '<=' | '=', n: Number(m[2]) }
  return null
}
function numericMatch(cv: number, c: NumCriterion): boolean {
  switch (c.op) {
    case '>':
      return cv > c.n
    case '<':
      return cv < c.n
    case '>=':
      return cv >= c.n
    case '<=':
      return cv <= c.n
    case '=':
      return cv === c.n
    case 'range':
      return cv >= Math.min(c.n, c.n2) && cv <= Math.max(c.n, c.n2)
  }
}

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
   * 検索モード（FileMaker風インライン検索）で、この列の検索対象文字列を返す。
   * 未指定の場合は item[key] の生値を文字列化して検索する（ネスト構造の列では明示推奨）。
   * 空文字 '' を返すと、その列は検索入力を出さない（検索対象外）。
   */
  filterValue?: (item: T) => string
  /**
   * 検索モードで数値比較（>=, <=, >, <, =, 範囲 a..b）を行うための数値を返す。
   * 金額・件数などの列に指定する。未指定でも filterValue/生値が純粋な数値文字列なら比較可能。
   */
  filterNumber?: (item: T) => number | null | undefined
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
  /**
   * true のとき FileMaker風「検索モード」を有効化（一覧・テーブル系ページ向け）。
   * Shift+F でトグルし、ヘッダー直下に列ごとの条件入力行を表示。
   * 入力した全列に部分一致（AND）するレコードだけを表示中テーブルで絞り込む。
   */
  enableFind?: boolean
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
  enableFind = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // ── 検索モード（FileMaker風: 検索リクエストに条件入力 → Enter で実行 → 該当セット表示） ──
  // findOn   : 検索モード中（空の検索リクエストに条件入力中。データ行は隠す）
  // criteria : 入力中の条件（列key→値）
  // applied  : 実行済み（確定）の絞り込み条件。これが一覧を絞る。
  const [findOn, setFindOn] = useState(false)
  const [criteria, setCriteria] = useState<Record<string, string>>({})
  const [applied, setApplied] = useState<Record<string, string>>({})

  // このテーブル固有のID（Shift+F の対象を1テーブルに限定するため）
  const findIdRef = useRef<number>(0)
  if (findIdRef.current === 0) {
    __findTableSeq += 1
    findIdRef.current = __findTableSeq
  }
  // マウント時、まだアクティブが無ければ自分をアクティブに（単一テーブル画面で即使える）
  useEffect(() => {
    if (!enableFind) return
    if (__activeFindTable === null) __activeFindTable = findIdRef.current
    return () => {
      if (__activeFindTable === findIdRef.current) __activeFindTable = null
    }
  }, [enableFind])
  // ホバー/フォーカスで自分をアクティブにする
  const claimActive = () => {
    if (enableFind) __activeFindTable = findIdRef.current
  }

  // この列の検索対象文字列（filterValue 優先、無ければ生値を文字列化）
  const cellSearchText = (col: Column<T>, item: T): string => {
    if (col.filterValue) return col.filterValue(item)
    const raw = (item as Record<string, unknown>)[String(col.key)]
    if (raw === null || raw === undefined) return ''
    return String(raw)
  }
  // この列の数値（filterNumber 優先 → 生値が数値 → 検索文字列が純数値なら解釈）
  const colNumber = (col: Column<T>, item: T): number | null => {
    if (col.filterNumber) {
      const x = col.filterNumber(item)
      return x == null || Number.isNaN(x) ? null : x
    }
    const raw = (item as Record<string, unknown>)[String(col.key)]
    if (typeof raw === 'number') return raw
    const txt = cellSearchText(col, item).replace(/[,，\s円]/g, '')
    return /^-?\d+(\.\d+)?$/.test(txt) ? Number(txt) : null
  }

  // 1条件のマッチ判定：数値比較条件なら数値で、そうでなければ部分一致で判定
  const matchOne = (col: Column<T>, item: T, value: string): boolean => {
    const num = parseNumericCriterion(value)
    if (num) {
      const cv = colNumber(col, item)
      return cv != null && numericMatch(cv, num)
    }
    return cellSearchText(col, item).toLowerCase().includes(value.trim().toLowerCase())
  }

  // その列が検索可能か（filterValue 明示、または生値が文字列/数値で取れる）
  const colSearchable = (col: Column<T>): boolean => {
    if (col.filterValue) return data.some((it) => col.filterValue!(it) !== '')
    return data.some((it) => {
      const raw = (it as Record<string, unknown>)[String(col.key)]
      return typeof raw === 'string' || typeof raw === 'number'
    })
  }

  // 検索の実行・取消・解除
  const enterFind = () => {
    setCriteria(applied) // 既存の絞り込みを編集できるよう初期化
    setFindOn(true)
  }
  const performFind = () => {
    setApplied(criteria)
    setFindOn(false)
  }
  const cancelFind = () => setFindOn(false)
  const clearFind = () => {
    setApplied({})
    setCriteria({})
    setFindOn(false)
  }

  // Shift+F で検索モードに入る/抜ける。入力フィールドにフォーカス中は無視
  // （条件入力中の Enter=実行 / Esc=取消 は各入力欄側で処理し、文字入力と衝突させない）。
  useEffect(() => {
    if (!enableFind) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing =
        !!t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      if (typing) return
      // 複数テーブル画面では、アクティブ（直近に触れた）テーブルだけが Shift+F に反応
      if (__activeFindTable !== null && __activeFindTable !== findIdRef.current) return
      if (e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault()
        setFindOn((v) => {
          if (!v) setCriteria((c) => (Object.keys(c).length ? c : applied))
          return !v
        })
        return
      }
      if (findOn && e.key === 'Escape') {
        e.preventDefault()
        setFindOn(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enableFind, findOn, applied])

  // 確定済み条件で絞り込み（入力のある全列に部分一致＝AND・大文字小文字無視）
  const activeApplied = enableFind
    ? Object.entries(applied).filter(([, v]) => v.trim() !== '')
    : []
  const findData =
    activeApplied.length === 0
      ? data
      : data.filter((item) =>
          activeApplied.every(([k, v]) => {
            const col = columns.find((c) => String(c.key) === k)
            if (!col) return true
            return matchOne(col, item, v)
          })
        )

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  const sortedData = [...findData].sort((a, b) => {
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
        : 'px-1 py-1.5'
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
  // 一覧（compact）の文字を約1pt拡大（本文 11→12px / ヘッダ 10→11px）
  const tableText = isDense ? 'text-[10px] leading-tight' : isCompact ? 'text-[12px] leading-tight' : 'text-xs'
  const headText = isDense
    ? 'text-[9px] font-semibold leading-tight'
    : isCompact
      ? 'text-[11px] font-semibold leading-tight'
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

  const findBar = enableFind ? (
    findOn ? (
      // 検索モード中（FileMaker の Find Mode 相当）
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-blue-300 bg-blue-50 px-3 py-1.5 text-xs">
        <span className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
          🔍 検索モード
        </span>
        <span className="text-blue-900">各列に条件を入力 → Enter で検索</span>
        <button
          type="button"
          onClick={performFind}
          className="rounded bg-blue-600 px-3 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700"
        >
          検索実行
        </button>
        <button
          type="button"
          onClick={cancelFind}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
        >
          取消（Esc）
        </button>
        <span className="text-[10px] text-blue-400">
          複数列はAND・部分一致。金額/件数は {'>=1000000'}・{'<50000'}・{'=0'}・範囲 {'10000..50000'} で絞込可
        </span>
      </div>
    ) : activeApplied.length > 0 ? (
      // 検索実行後（該当セット表示中）
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs">
        <span className="font-semibold text-amber-900">
          🔍 検索結果 {total} 件
          <span className="ml-1 font-normal text-amber-700">／ 全 {data.length} 件</span>
        </span>
        <span className="text-[10px] text-amber-700">
          条件: {activeApplied.map(([k, v]) => `${columns.find((c) => String(c.key) === k)?.header ?? k}=${v}`).join(' / ')}
        </span>
        <button
          type="button"
          onClick={enterFind}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
        >
          条件を編集
        </button>
        <button
          type="button"
          onClick={clearFind}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
        >
          解除（全件表示）
        </button>
      </div>
    ) : (
      // 通常
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1 text-xs">
        <button
          type="button"
          onClick={enterFind}
          title="検索モード（Shift+F）"
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
        >
          🔍 検索モード（Shift+F）
        </button>
      </div>
    )
  ) : null

  return (
    <div
      className={paginated ? 'flex min-h-0 flex-col' : ''}
      onMouseEnter={claimActive}
      onFocusCapture={claimActive}
    >
      {findBar}
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
          {enableFind && findOn && (
            <tr className="border-b-2 border-blue-300 bg-blue-50">
              {columns.map((col, ci) => (
                <th
                  key={String(col.key)}
                  className={`${headPad} ${col.headerClassName ?? ''}`}
                  style={{ width: col.width }}
                >
                  {colSearchable(col) ? (
                    <input
                      // 先頭の検索可能列に自動フォーカス
                      autoFocus={ci === columns.findIndex((c) => colSearchable(c))}
                      value={criteria[String(col.key)] ?? ''}
                      onChange={(e) =>
                        setCriteria((c) => ({ ...c, [String(col.key)]: e.target.value }))
                      }
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          performFind()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelFind()
                        }
                      }}
                      placeholder="条件"
                      className="w-full min-w-0 rounded border border-blue-300 bg-white px-1 py-0.5 text-[11px] font-normal text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {enableFind && findOn ? (
            <tr>
              <td
                colSpan={columns.length}
                className={`${emptyPad} text-center text-blue-500 ${cellNoWrap || cellSingleLine ? '' : 'max-w-none whitespace-normal'}`}
              >
                検索条件を入力して Enter キーで検索（Esc で取消）
              </td>
            </tr>
          ) : sortedData.length === 0 ? (
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
