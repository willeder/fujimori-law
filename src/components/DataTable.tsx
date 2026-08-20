import { Fragment, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
// 検索条件の比較パーサ（数値・日付、>= <= > < = と範囲 a..b / a〜b）は共有ユーティリティに集約。
// 比較式でなければ null（→部分一致にフォールバック）。サーバの横断検索とも同一記法。
import {
  parseFindCriterion,
  matchNumber,
  matchDate,
  extractIsoDate,
} from '../utils/findCriterion'
import { SuggestInput } from './SuggestInput'

// 1画面に複数のテーブルがある場合（案件詳細など）に Shift+F が全テーブルを
// 同時にトグルしないよう、「いま操作対象のテーブル」を1つだけ保持する簡易レジストリ。
// 直近にホバー/フォーカスしたテーブルがアクティブになり、Shift+F はそのテーブルだけに効く。
let __activeFindTable: number | null = null
let __findTableSeq = 0

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
  /**
   * ソート時にこの列の比較値を返す。ネスト構造（item.clientBasicInfo.name 等）の列で指定する。
   * 未指定の場合は従来どおり item[key] の生値を比較する。
   * 数値を返せば数値順、文字列を返せば日本語ロケール順で並ぶ（空値は常に末尾）。
   */
  sortValue?: (item: T) => string | number | null | undefined
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
   * 検索モードの条件入力に候補ドロップダウンを表示する（クリックで一覧・入力で絞込）。
   * 債権者名など、既存値から選ばせたい列に指定する。
   */
  filterSuggestions?: string[]
  /**
   * 検索モードの条件入力を出すかどうかの明示指定。
   * false=常に出さない（操作列・検索対象外の列） / true=常に出す / 未指定=自動判定
   */
  filterable?: boolean
  /**
   * CSV出力時にこの列の出力文字列を返す（No.166）。
   * 未指定の場合は filterValue → item[key] の生値の順で文字列化する。
   */
  csvValue?: (item: T) => string | number | null | undefined
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
  /**
   * 指定すると、検索実行時に「表示中データの絞り込み」ではなく DB 全体を横断検索する。
   * 条件(列key=field, 値=value)を受け取り、該当行（案件をまたぐ）を返す。
   * 返った該当セットをそのままこのテーブルに表示する（FileMaker の Find 相当）。
   */
  onGlobalFind?: (conditions: { field: string; value: string }[]) => Promise<T[]>
  /**
   * 指定すると、ソート状態を sessionStorage に保持し、画面遷移して戻っても復元する。
   * 画面ごとに一意なキーを渡す（例: "settlementResults"）。
   */
  persistKey?: string
  /**
   * 指定すると、検索実行時に「表示中テーブルの絞り込み/一覧表示」を行わず、条件を親へ渡す。
   * 親はDB全体を検索して該当セットを作り、案件詳細を1件ずつ左右ナビで渡り歩く等に使う。
   */
  onFindNavigate?: (conditions: { field: string; value: string }[]) => void
  /**
   * 指定すると「CSV出力」ボタンを表示する（No.166）。値は出力ファイル名の先頭
   * （例: "和解実績一覧" → 和解実績一覧_20260709.csv）。
   * 出力前にフィールドの追加・削除（チェック）と並び替え（↑↓）ができ、
   * 設定は localStorage に保存して次回も復元する。
   * 出力対象は「現在の絞り込み・ソートを適用した全件」（ページ送りは無視）。
   */
  csvExport?: string
  /**
   * 並び順を親コンポーネントで制御する場合に指定する（保存した絞り込み条件で
   * 並び順まで復元したいときなど）。onSortChange を渡したときだけ制御モードになり、
   * sortKey / sortOrder は親の値がそのまま使われる（persistKey による保持は行わない）。
   */
  sortKey?: string | null
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (key: string | null, order: 'asc' | 'desc') => void
  /**
   * 2段目の並び順（同点の行だけをさらに並べ替える）。kintone の一覧が
   * 「受任日の新しい順、同じ日ならレコード番号順」のように2段で並ぶため。
   * key は columns のキー（sortValue を持つ列）を指す。
   */
  sortKey2?: string | null
  sortOrder2?: 'asc' | 'desc'
  /**
   * 行の下に展開表示する内容（kintone の関連レコード一覧の「表示する▶」相当）。
   * isRowExpanded が true を返した行だけ、直後に全幅の行として描画する。
   */
  renderExpandedRow?: (item: T) => React.ReactNode
  /** その行が展開中かどうか */
  isRowExpanded?: (item: T) => boolean
  /**
   * 表示はしないが並び替えには使える列。
   * kintone は一覧に出していない項目でもソートできるため、非表示にした列を
   * ここに渡しておくと sortKey / sortKey2 の対象にできる。
   */
  sortOnlyColumns?: Column<T>[]
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
  persistKey,
  onGlobalFind,
  onFindNavigate,
  csvExport,
  sortKey: sortKeyProp,
  sortOrder: sortOrderProp,
  onSortChange,
  sortKey2 = null,
  sortOrder2 = 'asc',
  sortOnlyColumns,
  renderExpandedRow,
  isRowExpanded,
}: DataTableProps<T>) {
  // onSortChange が渡されたときだけ「親が並び順を持つ」制御モードになる。
  // 渡されない従来の使い方では、これまでどおり内部状態＋persistKey で保持する。
  const sortControlled = typeof onSortChange === 'function'
  const [internalSortKey, setInternalSortKey] = useState<string | null>(() => {
    if (!persistKey) return null
    try {
      const r = sessionStorage.getItem(`${persistKey}.sortKey`)
      return r ? (JSON.parse(r) as string | null) : null
    } catch {
      return null
    }
  })
  const [internalSortOrder, setInternalSortOrder] = useState<'asc' | 'desc'>(() => {
    if (!persistKey) return 'asc'
    try {
      return sessionStorage.getItem(`${persistKey}.sortOrder`) === 'desc' ? 'desc' : 'asc'
    } catch {
      return 'asc'
    }
  })
  const sortKey = sortControlled ? (sortKeyProp ?? null) : internalSortKey
  const sortOrder = sortControlled ? (sortOrderProp ?? 'asc') : internalSortOrder
  useEffect(() => {
    if (!persistKey || sortControlled) return
    try {
      sessionStorage.setItem(`${persistKey}.sortKey`, JSON.stringify(sortKey))
      sessionStorage.setItem(`${persistKey}.sortOrder`, sortOrder)
    } catch {
      /* noop */
    }
  }, [persistKey, sortControlled, sortKey, sortOrder])

  // ── 検索モード（FileMaker風: 検索リクエストに条件入力 → Enter で実行 → 該当セット表示） ──
  // findOn   : 検索モード中（空の検索リクエストに条件入力中。データ行は隠す）
  // criteria : 入力中の条件（列key→値）
  // applied  : 実行済み（確定）の絞り込み条件。これが一覧を絞る。
  const [findOn, setFindOn] = useState(false)
  const [criteria, setCriteria] = useState<Record<string, string>>({})
  const [applied, setApplied] = useState<Record<string, string>>({})
  // DB全体検索の該当セット（onGlobalFind 使用時）。null=未実行
  const [globalRows, setGlobalRows] = useState<T[] | null>(null)
  const [globalLoading, setGlobalLoading] = useState(false)

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

  // 1条件のマッチ判定：比較式（数値/日付）なら比較で、そうでなければ部分一致で判定
  const matchOne = (col: Column<T>, item: T, value: string): boolean => {
    const crit = parseFindCriterion(value)
    if (crit) {
      if (crit.kind === 'num' || crit.kind === 'num-range') {
        const cv = colNumber(col, item)
        return cv != null && matchNumber(cv, crit)
      }
      // 日付比較：セル文字列から日付を抽出して YYYY-MM-DD で比較。
      // 日付を持たない列（テキスト等）では従来どおり部分一致にフォールバック
      // （例: コメント列に「2026/08」と入れた場合は文字として検索）
      const cd = extractIsoDate(cellSearchText(col, item))
      if (cd != null) return matchDate(cd, crit)
      return cellSearchText(col, item).toLowerCase().includes(value.trim().toLowerCase())
    }
    return cellSearchText(col, item).toLowerCase().includes(value.trim().toLowerCase())
  }

  // その列が検索可能か。
  //   1. filterable 明示（false=常に出さない / true=常に出す）
  //   2. 候補付き列（filterSuggestions）は常に出す
  //   3. データが0件でも検索ボックスは出す（検索してから表示する一覧・DB全体検索のため）
  //   4. データがあるときは、値が取れる列だけに絞る（従来どおり）
  const colSearchableFn = (col: Column<T>): boolean => {
    if (col.filterable === false) return false
    if (col.filterable === true) return true
    if (col.filterSuggestions && col.filterSuggestions.length > 0) return true
    if (data.length === 0) return true
    if (col.filterValue) return data.some((it) => col.filterValue!(it) !== '')
    return data.some((it) => {
      const raw = (it as Record<string, unknown>)[String(col.key)]
      return typeof raw === 'string' || typeof raw === 'number'
    })
  }
  // 検索モード中のみ、列ごとの検索可否・先頭検索可能列を一度だけ算出（大量行での二重ループ回避）
  const searchableFlags = enableFind && findOn ? columns.map(colSearchableFn) : []
  const firstSearchableIdx = searchableFlags.indexOf(true)

  // 検索の実行・取消・解除
  const enterFind = () => {
    setCriteria(applied) // 既存の絞り込みを編集できるよう初期化
    setFindOn(true)
  }
  const performFind = () => {
    const active = Object.entries(criteria)
      .map(([field, value]) => ({ field, value: value.trim() }))
      .filter((c) => c.value !== '')
    // 検索結果を左右ナビで渡り歩くモード：条件を親へ渡してテーブル自体は変えない
    if (onFindNavigate) {
      setFindOn(false)
      if (active.length > 0) onFindNavigate(active)
      return
    }
    setApplied(criteria)
    setFindOn(false)
    if (onGlobalFind) {
      // DB全体検索：条件をサーバへ送り、該当セットをこのテーブルに表示
      if (active.length === 0) {
        setGlobalRows(null)
        return
      }
      setGlobalLoading(true)
      Promise.resolve(onGlobalFind(active))
        .then((rows) => setGlobalRows(rows))
        .catch(() => setGlobalRows([]))
        .finally(() => setGlobalLoading(false))
    }
  }
  const cancelFind = () => setFindOn(false)
  const clearFind = () => {
    setApplied({})
    setCriteria({})
    setFindOn(false)
    setGlobalRows(null)
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
      // Ctrl/Cmd が押されている場合は全体検索（FindModeLauncher）に譲る
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'F' || e.key === 'f')) {
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
    globalRows != null
      ? globalRows // DB全体検索の該当セット（サーバ側で絞込済み）
      : activeApplied.length === 0
        ? data
        : data.filter((item) =>
            activeApplied.every(([k, v]) => {
              const col = columns.find((c) => String(c.key) === k)
              if (!col) return true
              return matchOne(col, item, v)
            })
          )

  const handleSort = (key: string) => {
    const nextOrder: 'asc' | 'desc' = sortKey === key && sortOrder === 'asc' ? 'desc' : 'asc'
    if (sortControlled) {
      onSortChange(key, nextOrder)
      return
    }
    setInternalSortKey(key)
    setInternalSortOrder(nextOrder)
  }

  // 並び替え用の列定義（sortValue を持つ列だけ新しい比較ロジックを使う）
  // 表示中の列に無ければ、並び替え専用に渡された列からも探す
  const findSortColumn = (key: string): Column<T> | undefined =>
    columns.find((c) => String(c.key) === key) ??
    sortOnlyColumns?.find((c) => String(c.key) === key)
  const sortColumn = sortKey ? findSortColumn(sortKey) : undefined
  const sortColumn2 = sortKey2 ? findSortColumn(sortKey2) : undefined

  /** 1つのキーで2行を比べる。同点なら 0 */
  const compareBy = (a: T, b: T, key: string, col: Column<T> | undefined, order: 'asc' | 'desc') => {
    // sortValue 指定あり: ネスト構造の値を取り出して比較する。
    // 数値は数値として、文字列は日本語ロケールで比較し、空値は常に末尾へ送る。
    if (col?.sortValue) {
      const aVal = col.sortValue(a)
      const bVal = col.sortValue(b)
      const aEmpty = aVal === null || aVal === undefined || aVal === ''
      const bEmpty = bVal === null || bVal === undefined || bVal === ''
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1
      if (bEmpty) return -1
      const comparison =
        typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal), 'ja')
      return order === 'asc' ? comparison : -comparison
    }

    // sortValue 未指定: 従来どおり item[key] の生値をそのまま比較する
    const aVal = (a as Record<string, unknown>)[key]
    const bVal = (b as Record<string, unknown>)[key]
    if (aVal === bVal) return 0
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1
    const comparison = aVal < bVal ? -1 : 1
    return order === 'asc' ? comparison : -comparison
  }

  const sortedData = [...findData].sort((a, b) => {
    if (!sortKey) return 0
    const first = compareBy(a, b, sortKey, sortColumn, sortOrder)
    if (first !== 0) return first
    // 1段目が同点のときだけ2段目で並べる
    if (!sortKey2 || sortKey2 === sortKey) return 0
    return compareBy(a, b, sortKey2, sortColumn2, sortOrder2)
  })

  // ── ページネーション ──
  //
  // 表示件数とページ番号は persistKey ごとに sessionStorage で覚える（修正依頼44）。
  // 事務所からの指摘:
  //   「表示件数を変更して案件詳細に行って一覧に戻ると、最初のページに戻ってしまう」
  // 3ページ目を見ていたなら、戻ったときも3ページ目であってほしい、という趣旨。
  const pageKey = persistKey ? `${persistKey}.page` : ''
  const pageSizeKey = persistKey ? `${persistKey}.pageSize` : ''
  const [page, setPage] = useState(() => {
    if (!pageKey) return 1
    const v = Number(sessionStorage.getItem(pageKey))
    return Number.isFinite(v) && v >= 1 ? v : 1
  })
  const [pageSize, setPageSize] = useState<number>(() => {
    if (!pageSizeKey) return defaultPageSize
    const v = Number(sessionStorage.getItem(pageSizeKey))
    return v === 50 || v === 100 ? v : defaultPageSize
  })
  const total = sortedData.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)

  // 件数が変わったら1ページ目へ（絞り込みを変えたときなど）。
  // ただし**初回だけは戻さない**。データは非同期で入ってくるので件数が
  // 0 → N と動き、そこで戻してしまうと覚えたページが毎回消える。
  const lastTotalRef = useRef<number | null>(null)
  useEffect(() => {
    const prev = lastTotalRef.current
    lastTotalRef.current = total
    if (prev === null || prev === total) return
    setPage(1)
  }, [total])

  // 覚えておく
  useEffect(() => {
    if (pageKey) sessionStorage.setItem(pageKey, String(currentPage))
  }, [pageKey, currentPage])
  useEffect(() => {
    if (pageSizeKey) sessionStorage.setItem(pageSizeKey, String(pageSize))
  }, [pageSizeKey, pageSize])
  const pageData = paginated
    ? sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedData

  // ── CSV出力（No.166: フィールドの追加・削除・並び替えに対応） ──
  const csvStorageKey = csvExport ? `csv.fields.${persistKey ?? csvExport}` : ''
  // CSV候補列＝ヘッダー名を持つ列（操作列など header:'' は除外）
  const csvCandidates = columns.filter((c) => (c.header ?? '') !== '')
  const defaultCsvFields = () => csvCandidates.map((c) => ({ key: String(c.key), on: true }))
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvFields, setCsvFields] = useState<{ key: string; on: boolean }[]>(defaultCsvFields)
  // モーダルを開くたびに保存済み設定を読み、現在の列構成と突き合わせる
  // （列が増えていれば末尾に追加・無くなった列は除去）
  const openCsvModal = () => {
    let saved: { key: string; on: boolean }[] | null = null
    try {
      const raw = localStorage.getItem(csvStorageKey)
      if (raw) saved = JSON.parse(raw) as { key: string; on: boolean }[]
    } catch {
      saved = null
    }
    const validKeys = new Set(csvCandidates.map((c) => String(c.key)))
    const base = (saved ?? []).filter((f) => validKeys.has(f.key))
    const seen = new Set(base.map((f) => f.key))
    for (const c of csvCandidates) {
      if (!seen.has(String(c.key))) base.push({ key: String(c.key), on: saved == null })
    }
    setCsvFields(base.length > 0 ? base : defaultCsvFields())
    setCsvOpen(true)
  }
  const saveCsvFields = (fields: { key: string; on: boolean }[]) => {
    setCsvFields(fields)
    try {
      localStorage.setItem(csvStorageKey, JSON.stringify(fields))
    } catch {
      /* 保存失敗は無視 */
    }
  }
  const moveCsvField = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= csvFields.length) return
    const next = [...csvFields]
    ;[next[i], next[j]] = [next[j], next[i]]
    saveCsvFields(next)
  }
  // この列のCSV出力文字列（csvValue → filterValue → 生値の順）
  const cellCsvText = (col: Column<T>, item: T): string => {
    if (col.csvValue) {
      const v = col.csvValue(item)
      return v == null ? '' : String(v)
    }
    if (col.filterValue) return col.filterValue(item)
    const raw = (item as Record<string, unknown>)[String(col.key)]
    if (raw === null || raw === undefined) return ''
    return String(raw)
  }
  const csvEscape = (s: string): string =>
    /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  const downloadCsv = () => {
    const cols = csvFields
      .filter((f) => f.on)
      .map((f) => csvCandidates.find((c) => String(c.key) === f.key))
      .filter((c): c is Column<T> => !!c)
    if (cols.length === 0) return
    const header = cols.map((c) => csvEscape(c.header)).join(',')
    const lines = sortedData.map((item) =>
      cols.map((c) => csvEscape(cellCsvText(c, item))).join(','),
    )
    // Excel で文字化けしないよう UTF-8 BOM + CRLF
    const csv = '﻿' + [header, ...lines].join('\r\n') + '\r\n'
    const now = new Date()
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${csvExport}_${ymd}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setCsvOpen(false)
  }
  const csvButton = csvExport ? (
    <button
      type="button"
      onClick={openCsvModal}
      title="表示中の一覧をCSVファイルで出力（フィールドの追加・削除・並び替え可）"
      className="rounded border border-emerald-600 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
    >
      CSV出力
    </button>
  ) : null
  const csvModal =
    csvExport && csvOpen ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
        onClick={() => setCsvOpen(false)}
      >
        <div
          className="max-h-[85vh] w-[26rem] overflow-hidden rounded-lg bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
            <span className="text-sm font-semibold text-slate-700">CSV出力（{csvExport}）</span>
            <button
              type="button"
              onClick={() => setCsvOpen(false)}
              className="rounded px-2 py-0.5 text-slate-500 hover:bg-slate-100"
            >
              ✕
            </button>
          </div>
          <div className="px-4 py-2 text-[11px] text-slate-500">
            出力するフィールドにチェックし、↑↓で並び順を変更できます（設定は保存されます）。
            出力対象: 現在の絞り込み・ソートを適用した {sortedData.length} 件
          </div>
          <div className="max-h-[50vh] overflow-y-auto px-4 pb-2">
            {csvFields.map((f, i) => {
              const col = csvCandidates.find((c) => String(c.key) === f.key)
              if (!col) return null
              return (
                <div
                  key={f.key}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 py-1"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={f.on}
                      onChange={(e) =>
                        saveCsvFields(
                          csvFields.map((x, xi) =>
                            xi === i ? { ...x, on: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    <span className="truncate">{col.header}</span>
                  </label>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => moveCsvField(i, -1)}
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={i === csvFields.length - 1}
                      onClick={() => moveCsvField(i, 1)}
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => saveCsvFields(csvFields.map((f) => ({ ...f, on: true })))}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
              >
                全選択
              </button>
              <button
                type="button"
                onClick={() => saveCsvFields(csvFields.map((f) => ({ ...f, on: false })))}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
              >
                全解除
              </button>
              <button
                type="button"
                onClick={() => saveCsvFields(defaultCsvFields())}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
              >
                初期に戻す
              </button>
            </div>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={csvFields.every((f) => !f.on)}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              出力する
            </button>
          </div>
        </div>
      </div>
    ) : null

  const getValue = (item: T, key: string): unknown => {
    return (item as Record<string, unknown>)[key]
  }

  const alignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }

  // ---- 行クリックの判定（修正依頼⑰・㊿）---------------------------------
  // 事務所からの指摘:
  //   「セルの文字をドラッグしてコピーしようとすると詳細に飛んでしまう」
  //   「遷移は左端の項目からだけにしてほしい」
  // 対応:
  //   1) 左端の列（td の cellIndex が 0）を押したときだけ遷移する
  //   2) 押した位置から 4px 以上動いていたら「ドラッグ＝選択」とみなして遷移しない
  //   3) 文字が選択されている状態のクリックも遷移しない
  //   4) セル内のボタン・リンク・入力欄を押したときは、その部品の動作を優先する
  const rowPressRef = useRef<{ x: number; y: number } | null>(null)
  const handleRowMouseDown = (e: ReactMouseEvent<HTMLTableRowElement>) => {
    rowPressRef.current = { x: e.clientX, y: e.clientY }
  }
  const handleRowClick = (e: ReactMouseEvent<HTMLTableRowElement>, item: T) => {
    const start = rowPressRef.current
    rowPressRef.current = null
    if (start) {
      const moved = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y)
      if (moved > 4) return
    }
    if ((window.getSelection()?.toString() ?? '').length > 0) return
    const target = e.target as HTMLElement | null
    if (!target) return
    if (target.closest('button, a, input, select, textarea, label, [contenteditable="true"]')) return
    const td = target.closest('td')
    if (!td || td.cellIndex !== 0) return
    // 開く直前に、いま見えている並び順を控えておく（修正依頼㉙）。
    // 詳細画面の「前へ／次へ」で、絞り込みと並び替えを反映した順に辿れるようにするため。
    // 毎回の描画で書くと重いので、実際に開くこの瞬間だけ書く。
    if (persistKey) {
      try {
        sessionStorage.setItem(
          `${persistKey}.order`,
          JSON.stringify(sortedData.map((x) => getValue(x, String(keyField))))
        )
      } catch {
        /* 容量超過などで書けなくても、前後移動が使えないだけなので無視する */
      }
    }
    onRowClick?.(item)
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
          {csvButton}
          <label className="flex items-center gap-1">
            表示件数
            <select
              value={pageSize}
              onChange={(e) => {
                // 表示件数を変えたときは、見ている位置がずれるので1ページ目に戻す
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
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
        <span className="basis-full text-xs font-medium leading-snug text-blue-700">
          各フィールドは部分一致、複数フィールド検索可。以上未満の指定：{'>=1000000'}、{'<50000'}、{'>=2026/07/01'}、{'=0'} など（値の前に等号不等号）。範囲指定：{'10000..50000'}、{'..2026/07'}、{'2026/07..'} など（ドット2つ）で絞込
        </span>
      </div>
    ) : globalLoading ? (
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs">
        <span className="font-semibold text-amber-900">🔍 DB全体を検索中…</span>
      </div>
    ) : activeApplied.length > 0 || globalRows != null ? (
      // 検索実行後（該当セット表示中）
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs">
        <span className="font-semibold text-amber-900">
          🔍 {globalRows != null ? 'DB全体の検索結果' : '検索結果'} {total} 件
          {globalRows == null && (
            <span className="ml-1 font-normal text-amber-700">／ 全 {data.length} 件</span>
          )}
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
      {csvExport && !(paginated && total > 0) && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1">
          {csvButton}
        </div>
      )}
      {csvModal}
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
                  {searchableFlags[ci] ? (
                    col.filterSuggestions && col.filterSuggestions.length > 0 ? (
                      // 候補付きの条件入力（クリックで一覧表示・入力で絞込。債権者列など）
                      <div onClick={(e) => e.stopPropagation()}>
                        <SuggestInput
                          autoFocus={ci === firstSearchableIdx}
                          value={criteria[String(col.key)] ?? ''}
                          onValueChange={(v) =>
                            setCriteria((c) => ({ ...c, [String(col.key)]: v }))
                          }
                          suggestions={col.filterSuggestions}
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
                      </div>
                    ) : (
                    <input
                      // 先頭の検索可能列に自動フォーカス
                      autoFocus={ci === firstSearchableIdx}
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
                    )
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
              const expanded = !!renderExpandedRow && isRowExpanded?.(item) === true
              return (
              <Fragment key={String(getValue(item, String(keyField)))}>
              <tr
                // 外から特定の行までスクロールさせるための目印
                // （入金スケジュールの一括表示から該当行へ飛ぶのに使う）
                data-row-key={String(getValue(item, String(keyField)))}
                className={`border-b border-slate-100 ${onRowClick ? 'hover:bg-blue-50' : ''} ${index % 2 === 1 && !customRowClass ? 'bg-slate-200/50' : ''} ${customRowClass}`}
                onMouseDown={onRowClick ? handleRowMouseDown : undefined}
                onClick={onRowClick ? (e) => handleRowClick(e, item) : undefined}
              >
                {columns.map((col, colIndex) => {
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
                    // 行遷移は左端の列だけ。他の列は文字を選択してコピーするための場所にする
                    className={`${cellPad} ${alignClass[col.align ?? 'left']} ${bodyCellWrap} tabular-nums ${
                      onRowClick && colIndex === 0 ? 'cursor-pointer' : ''
                    } ${col.cellClassName ?? ''}`}
                    title={
                      onRowClick && colIndex === 0
                        ? 'クリックで開きます（他の列はコピー用に選択できます）'
                        : undefined
                    }
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
              {expanded && (
                <tr className="border-b border-slate-200 bg-slate-50">
                  <td colSpan={columns.length} className="p-0 align-top">
                    {renderExpandedRow!(item)}
                  </td>
                </tr>
              )}
              </Fragment>
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
