import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCaseState } from '../store/useCaseStore'
import { DataTable, type Column, StatusBadge } from '../components'
import { AppHeader } from '../components/AppHeader'
import { SEARCH_FIELDS, type Condition } from './searchFields'
import { useSessionState } from '../hooks/useSessionState'
import { useCreditorNames } from '../hooks/useCreditorNames'
import { loadFilterHistory, saveFilterHistory, filterHistoryLabel } from '../utils/findHistory'
import { SavedFilterBar } from '../components/SavedFilterBar'
import { CaseRowDetail } from '../components/CaseRowDetail'
import { FilterModal } from '../components/FilterModal'
import {
  compactFilterQuery,
  emptyFilterQuery,
  type FilterQuery,
} from '../types/filter'
import {
  normalizeCaseListPayload,
  type CaseListFilterPayload,
  type CaseListSort,
  type SavedFilter,
} from '../types/savedFilter'
import type { Case } from '../types'
import { normalizeNameText, includesNormalized } from '../lib/nameSearch'

type SearchField = 'all' | 'name' | 'phone' | 'prefecture' | 'status' | 'staff'

/** 検索フィールドのコード → 日本語ラベル（保存条件の内容表示に使う） */
const SEARCH_FIELD_LABEL: Record<string, string> = Object.fromEntries(
  SEARCH_FIELDS.map((f) => [f.field, f.label])
)

/**
 * 列ごとの並び替え用の値。Case はネスト構造なので、列定義とは別に取り出し方を持つ。
 * ここに載っている列だけがヘッダークリックで並び替えできる（修正依頼⑭）。
 * LINE連携済/未・LINE@URL は並び替えの意味がないため対象外。
 */
const SORT_VALUE: Record<
  string,
  ((c: Case) => string | number | null | undefined) | undefined
> = {
  id: (c) => c.metadata.externalId ?? '',
  // kintone の「レコード番号」。ID（103436E のような文字列）とは別物
  recordNumber: (c) => c.clientBasicInfo.recordNumber ?? null,
  acceptanceDate: (c) => c.appointmentInfo.acceptanceDate ?? '',
  cautionRank: (c) => c.clientBasicInfo.cautionRank ?? '',
  listRegisteredDate: (c) => c.metadata.listRegisteredDate ?? '',
  listCategory: (c) => c.metadata.listCategory ?? '',
  acceptanceRank: (c) => c.appointmentInfo.acceptanceRank ?? '',
  debtAdjustmentType: (c) => c.appointmentInfo.debtAdjustmentType ?? '',
  status: (c) => c.settlementInfo.status ?? '',
  // 氏名はフリガナがあればフリガナ順（五十音順）で並べる
  name: (c) => c.clientBasicInfo.furigana || c.clientBasicInfo.name || '',
  furigana: (c) => c.clientBasicInfo.furigana ?? '',
  phone: (c) => c.clientBasicInfo.phone ?? '',
  creditorCount: (c) => c.debtInfo.creditorCount,
  reminderDate: (c) => c.reminderInfo?.reminderDate ?? '',
  nextResponseDate: (c) => c.reminderInfo?.nextResponseDate ?? '',
  // 既定では非表示の追加列も、保存した絞り込みから並び替えに指定できるようにする
  settlementProposalDate: (c) => c.settlementInfo.proposalDate ?? '',
  postSettlementPaymentCount: (c) => c.settlementInfo.postSettlementPaymentCount,
  nextPaymentDate: (c) => c.paymentInfo.nextPaymentDate ?? '',
  monthlyPaymentDay: (c) => c.paymentInfo.monthlyPaymentDay ?? '',
  paymentDelay: (c) => c.clientBasicInfo.paymentDelay ?? '',
  bicycleNote: (c) => c.clientBasicInfo.bicycleNote ?? '',
  pension: (c) => c.clientBasicInfo.pension ?? '',
  lineUrl: (c) => c.clientBasicInfo.lineUrl ?? '',
  payDay: (c) => c.clientBasicInfo.payDay ?? '',
  birthDate: (c) => c.clientBasicInfo.birthDate ?? '',
  vAccountBranch: (c) => c.paymentInfo.vAccountBranch ?? '',
  vAccountNumber: (c) => c.paymentInfo.vAccountNumber ?? '',
  basePaymentAmount: (c) => c.paymentInfo.basePaymentAmount,
  resignationDate: (c) => c.settlementInfo.resignationDate ?? '',
  elapsedDays: (c) => c.appointmentInfo.elapsedDays,
  cAcceptancePromotionDate: (c) => c.appointmentInfo.cAcceptancePromotionDate ?? '',
  age: (c) => c.clientBasicInfo.age,
  installmentCount: (c) => c.feeInfo.installmentCount,
  firstPaymentWithinTenDays: (c) => c.paymentInfo.firstPaymentWithinTenDays ?? '',
  preRequestPayment: (c) => c.debtInfo.preRequestPayment,
  postRequestPayment: (c) => c.debtInfo.postRequestPayment,
  uncollectedFee: (c) => c.feeInfo.uncollectedFee,
  declaredDebtAmount: (c) => c.debtInfo.declaredDebtAmount,
  officeFee: (c) => c.feeInfo.officeFee,
  cumulativePlannedFeeAllocation: (c) => c.paymentInfo.cumulativePlannedFeeAllocation,
  plannedPaymentFeeTotal: (c) => c.feeInfo.plannedPaymentFeeTotal,
  cumulativePlannedAgentFeeAllocation: (c) =>
    c.paymentInfo.cumulativePlannedAgentFeeAllocation,
  cumulativePlannedPoolAllocation: (c) => c.paymentInfo.cumulativePlannedPoolAllocation,
  cumulativeHandlingFee: (c) => c.paymentInfo.cumulativeHandlingFee,
  cumulativePlannedPayment: (c) => c.paymentInfo.cumulativePlannedPayment,
  cumulativePaymentAmount: (c) => c.paymentInfo.cumulativePaymentAmount,
  cumulativeFeeAllocation: (c) => c.paymentInfo.cumulativeFeeAllocation,
  cumulativeAgentFeeAllocation: (c) => c.paymentInfo.cumulativeAgentFeeAllocation,
  cumulativePoolAllocation: (c) => c.paymentInfo.cumulativePoolAllocation,
  cumulativePlannedRepaymentAllocation: (c) => c.paymentInfo.cumulativePlannedRepaymentAllocation,
  cumulativeRepaymentAllocation: (c) => c.paymentInfo.cumulativeRepaymentAllocation,
  appointmentStaff: (c) => c.appointmentInfo.appointmentStaff ?? '',
  interviewStaff: (c) => c.appointmentInfo.interviewStaff ?? '',
}

/** 2段目の並び替えに指定できる列（SORT_VALUE を持つ列と同じ並び） */
const SORT2_OPTIONS: { key: string; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'recordNumber', label: 'レコード番号' },
  { key: 'acceptanceDate', label: '受任日' },
  { key: 'listRegisteredDate', label: 'リスト登録日' },
  { key: 'name', label: '名前（フリガナ順）' },
  { key: 'furigana', label: 'フリガナ' },
  { key: 'status', label: '受任後ステータス' },
  { key: 'debtAdjustmentType', label: '債務整理区分' },
  { key: 'creditorCount', label: '債権社数' },
  { key: 'reminderDate', label: 'リマインド日' },
  { key: 'settlementProposalDate', label: '和解提案予定日' },
  { key: 'nextPaymentDate', label: '次回入金日' },
  { key: 'declaredDebtAmount', label: '申告債務額' },
  { key: 'officeFee', label: '事務所報酬（通常）' },
  { key: 'appointmentStaff', label: 'アポ担当' },
  { key: 'interviewStaff', label: '面談担当' },
]

/**
 * 一覧の文字列セルを「空白含む n 文字まで」に切り詰める。
 * n+1 文字以上は先頭 n 文字のみ表示（…は付けない）。全文は title 属性で確認可能。
 */
function clip(s: string | null | undefined, n: number): string {
  const v = s ?? '-'
  return v.length > n ? v.slice(0, n) : v
}

export function CaseListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { cases } = useCaseState()
  // 絞り込み条件は sessionStorage に保持し、詳細から戻っても復元する
  const [searchField, setSearchField] = useSessionState<SearchField>('caseList.field', 'all')
  const [searchValue, setSearchValue] = useSessionState('caseList.value', '')
  // 絞り込み（サーバ横断検索・演算子つき・AND/OR）
  const [filter, setFilter] = useSessionState<FilterQuery>(
    'caseList.filter',
    emptyFilterQuery()
  )
  const [filterOpen, setFilterOpen] = useState(false)
  // 絞り込みモーダルの「保存」から、保存ダイアログを開くためのトリガー
  const [saveRequestedAt, setSaveRequestedAt] = useState(0)
  const [results, setResults] = useState<Case[] | null>(null)
  const [searching, setSearching] = useState(false)
  // 並び順。絞り込みの有無にかかわらず有効（修正依頼⑭）。
  // null のときは既定の No（id）昇順。
  const [sort, setSort] = useSessionState<CaseListSort | null>('caseList.sort', null)
  // 2段目の並び順。1段目が同じ値の行だけをさらに並べ替える
  // （kintone の「受任日の新しい順、同じ日ならID順」に合わせるため）
  const [sort2, setSort2] = useSessionState<CaseListSort | null>('caseList.sort2', null)
  // 適用中の保存条件（プルダウンの選択状態と「適用中」バッジに使う）
  const [activeFilterId, setActiveFilterId] = useSessionState<string | null>(
    'caseList.savedFilterId',
    null
  )

  /**
   * 表示する列（キーの配列・左から順）。null は既定の列セット。
   * kintone のビューと同じく、保存した絞り込みごとに列を切り替えられるようにする。
   * 以前は金額列だけを真偽値トグルで出し分けていたが、列指定に一本化した。
   */
  const [columnKeys, setColumnKeys] = useSessionState<string[] | null>(
    'caseList.columns',
    null
  )
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)

  /**
   * 行の展開（kintone の関連レコード一覧「表示する▶ / 閉じる▾」）。
   * 一度に1案件だけ開く。接触履歴と債権一覧は同時に開ける。
   */
  const [expanded, setExpanded] = useState<{
    caseId: number
    contacts: boolean
    creditors: boolean
    payments: boolean
    settlement: boolean
  } | null>(null)
  const toggleExpand = (
    caseId: number,
    kind: 'contacts' | 'creditors' | 'payments' | 'settlement'
  ) => {
    setExpanded((prev) => {
      if (!prev || prev.caseId !== caseId) {
        return {
          caseId,
          contacts: kind === 'contacts',
          creditors: kind === 'creditors',
          payments: kind === 'payments',
          settlement: kind === 'settlement',
        }
      }
      const next = { ...prev, [kind]: !prev[kind] }
      return next.contacts || next.creditors || next.payments || next.settlement ? next : null
    })
  }
  /** 展開リンク（行クリックの画面遷移を止めてから開閉する） */
  const expandLink = (
    item: Case,
    kind: 'contacts' | 'creditors' | 'payments' | 'settlement'
  ) => {
    const open = expanded?.caseId === item.id && expanded[kind]
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          toggleExpand(item.id, kind)
        }}
        className="whitespace-nowrap text-[11px] text-blue-600 hover:underline"
      >
        {open ? '閉じる ▾' : '表示する ▶'}
      </button>
    )
  }

  // 絞り込み履歴（直近10件）No.147
  const [filterHistory, setFilterHistory] = useState<FilterQuery[]>(() => loadFilterHistory())
  // 債権者名の候補（絞り込みモーダルのサジェスト用）
  const creditorNames = useCreditorNames()

  /** 絞り込みを実行してサーバから該当案件を取得する */
  const runFilter = async (q: FilterQuery) => {
    const active = compactFilterQuery(q)
    if (active.conditions.length === 0) {
      setResults(null)
      return
    }
    setFilterHistory(saveFilterHistory(active))
    setSearching(true)
    try {
      const r = await fetch('/api/cases/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions: active.conditions, logic: active.logic }),
      })
      setResults(r.ok ? ((await r.json()) as Case[]) : [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  /** モーダルの「適用」 */
  const applyFilter = (q: FilterQuery) => {
    setFilter(q)
    setFilterOpen(false)
    setActiveFilterId(null)
    void runFilter(q)
  }

  /** 絞り込みを解除して既定表示（全件・No 昇順）に戻す */
  const clearFilter = () => {
    setResults(null)
    setFilter(emptyFilterQuery())
    setSearchValue('')
    setActiveFilterId(null)
    setSort(null)
    setSort2(null)
    setColumnKeys(null)
  }

  // ── 保存した絞り込み条件（共有フィルタ）──────────────────────
  // （以前はここに filtering という判定があり、絞り込み中だけ並び替えを許していたが、
  //   修正依頼⑭で絞り込みの有無にかかわらず並び替えられるようにしたため不要になった）

  /** いま画面に出ている絞り込み状態（「この条件を保存」で保存される内容） */
  const currentPayload: CaseListFilterPayload = useMemo(
    () => ({
      version: 2,
      quick: { field: searchField, value: searchValue },
      filter: compactFilterQuery(filter),
      sort,
      sort2,
      columns: columnKeys,
    }),
    [searchField, searchValue, filter, sort, sort2, columnKeys]
  )

  /** 保存条件を画面に適用する */
  const applySavedFilter = (saved: SavedFilter) => {
    const payload = normalizeCaseListPayload(saved.payload)
    setActiveFilterId(saved.id)
    setSearchField((payload.quick.field ?? 'all') as SearchField)
    setSearchValue(payload.quick.value ?? '')
    setSort(payload.sort)
    setSort2(payload.sort2 ?? null)
    setColumnKeys(payload.columns ?? null)
    setFilter(payload.filter)
    if (payload.filter.conditions.length > 0) void runFilter(payload.filter)
    else setResults(null)
  }

  // FileMaker風「検索モード」（詳細レコードでCtrl+F）から渡された条件で自動検索。
  // 検索モードは旧形式（{field,value}）なので「含む」条件に読み替える。
  useEffect(() => {
    const st = location.state as { conditions?: Condition[] } | null
    if (st?.conditions && st.conditions.length > 0) {
      const q: FilterQuery = {
        logic: 'and',
        conditions: st.conditions
          .filter((c) => c.value.trim())
          .map((c) => ({ field: c.field, operator: 'contains' as const, values: [c.value] })),
      }
      setFilter(q)
      void runFilter(q)
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const filteredCases = useMemo(() => {
    if (!searchValue.trim()) return cases

    const query = searchValue.toLowerCase()
    // 入力した「文字列そのもの」が含まれるかで判定（大文字小文字のみ無視）。
    // 電話番号も数字抜き出し等の正規化はせず、ハイフン込みの文字列のまま照合する。
    // （以前は数字だけに正規化していたため「90169E」が電話番号の「90169」に化けて
    //   別案件を巻き込んでいた。その挙動を廃止。）
    const inc = (s: string | null | undefined) => (s ?? '').toLowerCase().includes(query)
    // 氏名・フリガナだけは空白と半角カナ／ひらがなの差を吸収して照合する。
    // 「ヤマダタロウ」と続けて打っても「ヤマダ＿タロウ」（＿は全角スペース）に当たるようにするため（修正依頼⑱）。
    const nq = normalizeNameText(searchValue)
    const incName = (s: string | null | undefined) => includesNormalized(s, nq)
    return cases.filter((c) => {
      switch (searchField) {
        case 'name':
          return incName(c.clientBasicInfo.name) || incName(c.clientBasicInfo.furigana)
        case 'phone':
          return inc(c.clientBasicInfo.phone)
        case 'prefecture':
          return inc(c.clientBasicInfo.prefecture)
        case 'status':
          return inc(c.settlementInfo.status)
        case 'staff':
          return (
            inc(c.appointmentInfo.appointmentStaff) ||
            inc(c.appointmentInfo.interviewStaff) ||
            inc(c.appointmentInfo.judicialScrivener)
          )
        default:
          return (
            inc(c.metadata?.externalId) ||
            incName(c.clientBasicInfo.name) ||
            incName(c.clientBasicInfo.furigana) ||
            inc(c.clientBasicInfo.prefecture) ||
            inc(c.settlementInfo.status) ||
            inc(c.appointmentInfo.judicialScrivener) ||
            inc(c.clientBasicInfo.phone)
          )
      }
    })
  }, [cases, searchField, searchValue])

  // 並び順はサーバ側（src/server/handlers.ts の CASE_LIST_ORDER）が、kintone のビュー
  // 「全件一覧」と同じ 受任日の新しい順 → レコード番号の新しい順 → No の新しい順で返す。
  // 以前はここで No（id）昇順に並べ直しており、そのサーバの並びを打ち消していたため、
  // 取り込んだ新規案件が最終ページの末尾に回って一覧の先頭に出てこなかった
  // （事務所から「取り込んだ新規案件が一覧に出てこない」と再度ご指摘）。
  // 列見出しクリックによる並び替えは DataTable 側が担うので、ここでは並べ替えない。
  const sortedCases = filteredCases

  // 詳細検索の結果があればそれを優先表示、無ければクイック検索の結果
  // （詳細検索の結果もサーバ側で CASE_LIST_ORDER と同じ順に返る）
  const displayed = useMemo(() => {
    if (results != null) return results
    return sortedCases
  }, [results, sortedCases])

  const yen = (n: number | null | undefined) =>
    n != null ? (
      <span>
        {n.toLocaleString()}
        <span className="text-slate-400 text-[10px] ml-0.5">円</span>
      </span>
    ) : (
      '-'
    )

  /**
   * 「報酬・弁代・プールチェック」で確認する金額列（kintone の並び順に合わせる）。
   * 事務所報酬（通常）は常時表示の列なのでここには含めない。
   */
  const feeColumns: Column<Case>[] = [
    {
      key: 'cumulativePlannedPayment',
      header: '累)入金予定額',
      width: '124px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.cumulativePlannedPayment),
      filterValue: (item) =>
        item.paymentInfo.cumulativePlannedPayment != null ? String(item.paymentInfo.cumulativePlannedPayment) : '',
      filterNumber: (item) => item.paymentInfo.cumulativePlannedPayment,
    },
    {
      key: 'cumulativePaymentAmount',
      header: '累)入金金額',
      width: '124px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.cumulativePaymentAmount),
      filterValue: (item) =>
        item.paymentInfo.cumulativePaymentAmount != null ? String(item.paymentInfo.cumulativePaymentAmount) : '',
      filterNumber: (item) => item.paymentInfo.cumulativePaymentAmount,
    },
    {
      key: 'cumulativeFeeAllocation',
      header: '累)報酬充当額',
      width: '124px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.cumulativeFeeAllocation),
      filterValue: (item) =>
        item.paymentInfo.cumulativeFeeAllocation != null ? String(item.paymentInfo.cumulativeFeeAllocation) : '',
      filterNumber: (item) => item.paymentInfo.cumulativeFeeAllocation,
    },
    {
      key: 'cumulativeAgentFeeAllocation',
      header: '累)弁代報酬充当額',
      width: '124px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.cumulativeAgentFeeAllocation),
      filterValue: (item) =>
        item.paymentInfo.cumulativeAgentFeeAllocation != null ? String(item.paymentInfo.cumulativeAgentFeeAllocation) : '',
      filterNumber: (item) => item.paymentInfo.cumulativeAgentFeeAllocation,
    },
    {
      key: 'cumulativePoolAllocation',
      header: '累)ﾌﾟｰﾙ充当額',
      width: '124px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.cumulativePoolAllocation),
      filterValue: (item) =>
        item.paymentInfo.cumulativePoolAllocation != null ? String(item.paymentInfo.cumulativePoolAllocation) : '',
      filterNumber: (item) => item.paymentInfo.cumulativePoolAllocation,
    },
    {
      key: 'cumulativePlannedRepaymentAllocation',
      header: '累)弁済充当予定額',
      width: '124px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.cumulativePlannedRepaymentAllocation),
      filterValue: (item) =>
        item.paymentInfo.cumulativePlannedRepaymentAllocation != null ? String(item.paymentInfo.cumulativePlannedRepaymentAllocation) : '',
      filterNumber: (item) => item.paymentInfo.cumulativePlannedRepaymentAllocation,
    },
    {
      key: 'cumulativeRepaymentAllocation',
      header: '累)弁済充当額',
      width: '124px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.cumulativeRepaymentAllocation),
      filterValue: (item) =>
        item.paymentInfo.cumulativeRepaymentAllocation != null ? String(item.paymentInfo.cumulativeRepaymentAllocation) : '',
      filterNumber: (item) => item.paymentInfo.cumulativeRepaymentAllocation,
    },
    {
      key: 'cumulativePlannedFeeAllocation',
      header: '累)報酬充当予定額',
      width: '124px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.cumulativePlannedFeeAllocation),
      filterValue: (item) =>
        item.paymentInfo.cumulativePlannedFeeAllocation != null
          ? String(item.paymentInfo.cumulativePlannedFeeAllocation)
          : '',
      filterNumber: (item) => item.paymentInfo.cumulativePlannedFeeAllocation,
    },
    {
      key: 'plannedPaymentFeeTotal',
      header: '予定弁済報酬総額',
      width: '124px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.feeInfo.plannedPaymentFeeTotal),
      filterValue: (item) =>
        item.feeInfo.plannedPaymentFeeTotal != null
          ? String(item.feeInfo.plannedPaymentFeeTotal)
          : '',
      filterNumber: (item) => item.feeInfo.plannedPaymentFeeTotal,
    },
    {
      key: 'cumulativePlannedAgentFeeAllocation',
      header: '累)弁代報酬充当予定額',
      width: '140px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.cumulativePlannedAgentFeeAllocation),
      filterValue: (item) =>
        item.paymentInfo.cumulativePlannedAgentFeeAllocation != null
          ? String(item.paymentInfo.cumulativePlannedAgentFeeAllocation)
          : '',
      filterNumber: (item) => item.paymentInfo.cumulativePlannedAgentFeeAllocation,
    },
    {
      key: 'cumulativePlannedPoolAllocation',
      header: '累)ﾌﾟｰﾙ充当予定額',
      width: '128px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.cumulativePlannedPoolAllocation),
      filterValue: (item) =>
        item.paymentInfo.cumulativePlannedPoolAllocation != null
          ? String(item.paymentInfo.cumulativePlannedPoolAllocation)
          : '',
      filterNumber: (item) => item.paymentInfo.cumulativePlannedPoolAllocation,
    },
    {
      key: 'cumulativeHandlingFee',
      header: '累)手数料',
      width: '104px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.cumulativeHandlingFee),
      filterValue: (item) =>
        item.paymentInfo.cumulativeHandlingFee != null
          ? String(item.paymentInfo.cumulativeHandlingFee)
          : '',
      filterNumber: (item) => item.paymentInfo.cumulativeHandlingFee,
    },
  ]

  /**
   * 既定では出さない追加の列（kintone の各ビューに合わせて用意したもの）。
   * 保存した絞り込みが列を指定していればそれに従って表示される。
   */
  const checkColumns: Column<Case>[] = [
    {
      key: 'reminderDate',
      header: 'リマインド日',
      width: '92px',
      sortable: false,
      render: (item) => item.reminderInfo?.reminderDate ?? '-',
      filterValue: (item) => item.reminderInfo?.reminderDate ?? '',
    },
    {
      key: 'nextResponseDate',
      header: '次回対応日',
      width: '92px',
      sortable: false,
      render: (item) => item.reminderInfo?.nextResponseDate ?? '-',
      filterValue: (item) => item.reminderInfo?.nextResponseDate ?? '',
    },
    {
      key: 'birthDate',
      header: '生年月日',
      width: '92px',
      sortable: false,
      render: (item) => item.clientBasicInfo.birthDate ?? '-',
      filterValue: (item) => item.clientBasicInfo.birthDate ?? '',
    },
    {
      key: '_settlementDetail',
      header: '和解内容詳細',
      width: '92px',
      align: 'center',
      sortable: false,
      cellTruncate: false,
      render: (item) => expandLink(item, 'settlement'),
      filterValue: () => '',
    },
    {
      key: 'resignationDate',
      header: '辞任日',
      width: '88px',
      sortable: false,
      render: (item) => item.settlementInfo.resignationDate ?? '-',
      filterValue: (item) => item.settlementInfo.resignationDate ?? '',
    },
    {
      key: 'elapsedDays',
      header: '経過日数',
      width: '72px',
      align: 'right',
      sortable: false,
      render: (item) =>
        item.appointmentInfo.elapsedDays != null ? `${item.appointmentInfo.elapsedDays}日` : '-',
      filterValue: (item) =>
        item.appointmentInfo.elapsedDays != null ? String(item.appointmentInfo.elapsedDays) : '',
      filterNumber: (item) => item.appointmentInfo.elapsedDays,
    },
    {
      key: 'cAcceptancePromotionDate',
      header: 'C受任昇格日',
      width: '96px',
      sortable: false,
      render: (item) => item.appointmentInfo.cAcceptancePromotionDate ?? '-',
      filterValue: (item) => item.appointmentInfo.cAcceptancePromotionDate ?? '',
    },
    {
      key: 'age',
      header: '年齢',
      width: '52px',
      align: 'right',
      sortable: false,
      render: (item) => (item.clientBasicInfo.age != null ? `${item.clientBasicInfo.age}` : '-'),
      filterValue: (item) =>
        item.clientBasicInfo.age != null ? String(item.clientBasicInfo.age) : '',
      filterNumber: (item) => item.clientBasicInfo.age,
    },
    {
      key: 'installmentCount',
      header: '報酬分割回数',
      width: '92px',
      align: 'right',
      sortable: false,
      render: (item) =>
        item.feeInfo.installmentCount != null ? `${item.feeInfo.installmentCount}回` : '-',
      filterValue: (item) =>
        item.feeInfo.installmentCount != null ? String(item.feeInfo.installmentCount) : '',
      filterNumber: (item) => item.feeInfo.installmentCount,
    },
    {
      key: 'firstPaymentWithinTenDays',
      header: '10日以内',
      width: '72px',
      sortable: false,
      render: (item) => item.paymentInfo.firstPaymentWithinTenDays ?? '-',
      filterValue: (item) => item.paymentInfo.firstPaymentWithinTenDays ?? '',
    },
    {
      key: 'preRequestPayment',
      header: '依頼前 返済額',
      width: '104px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.debtInfo.preRequestPayment),
      filterValue: (item) =>
        item.debtInfo.preRequestPayment != null ? String(item.debtInfo.preRequestPayment) : '',
      filterNumber: (item) => item.debtInfo.preRequestPayment,
    },
    {
      key: 'postRequestPayment',
      header: '依頼後 返済額',
      width: '104px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.debtInfo.postRequestPayment),
      filterValue: (item) =>
        item.debtInfo.postRequestPayment != null ? String(item.debtInfo.postRequestPayment) : '',
      filterNumber: (item) => item.debtInfo.postRequestPayment,
    },
    {
      key: 'vAccountBranch',
      header: 'V口座-支店',
      width: '96px',
      sortable: false,
      render: (item) => item.paymentInfo.vAccountBranch ?? '-',
      filterValue: (item) => item.paymentInfo.vAccountBranch ?? '',
    },
    {
      key: 'vAccountNumber',
      header: 'V口座-番号',
      width: '96px',
      sortable: false,
      render: (item) => item.paymentInfo.vAccountNumber ?? '-',
      filterValue: (item) => item.paymentInfo.vAccountNumber ?? '',
    },
    {
      key: 'basePaymentAmount',
      header: '基本入金額',
      width: '92px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.paymentInfo.basePaymentAmount),
      filterValue: (item) =>
        item.paymentInfo.basePaymentAmount != null
          ? String(item.paymentInfo.basePaymentAmount)
          : '',
      filterNumber: (item) => item.paymentInfo.basePaymentAmount,
    },
    {
      key: 'payDay',
      header: '給与日',
      width: '64px',
      sortable: false,
      render: (item) => item.clientBasicInfo.payDay ?? '-',
      filterValue: (item) => item.clientBasicInfo.payDay ?? '',
    },
    {
      key: 'uncollectedFee',
      header: '報酬未回収額',
      width: '96px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.feeInfo.uncollectedFee),
      filterValue: (item) =>
        item.feeInfo.uncollectedFee != null ? String(item.feeInfo.uncollectedFee) : '',
      filterNumber: (item) => item.feeInfo.uncollectedFee,
    },
    {
      key: '_payments',
      header: '入金情報',
      width: '80px',
      align: 'center',
      sortable: false,
      cellTruncate: false,
      render: (item) => expandLink(item, 'payments'),
      filterValue: () => '',
    },
    {
      key: '_contactHistories',
      header: '依頼者 接触履歴',
      width: '92px',
      align: 'center',
      sortable: false,
      cellTruncate: false,
      render: (item) => expandLink(item, 'contacts'),
      filterValue: () => '',
    },
    {
      key: '_creditorList',
      header: '和解対象債権一覧',
      width: '104px',
      align: 'center',
      sortable: false,
      cellTruncate: false,
      render: (item) => expandLink(item, 'creditors'),
      filterValue: () => '',
    },
    {
      key: 'recordNumber',
      header: 'レコード番号',
      width: '84px',
      align: 'right',
      sortable: false,
      render: (item) => item.clientBasicInfo.recordNumber ?? '-',
      filterValue: (item) =>
        item.clientBasicInfo.recordNumber != null ? String(item.clientBasicInfo.recordNumber) : '',
      filterNumber: (item) => item.clientBasicInfo.recordNumber,
    },
    {
      key: 'paymentDelay',
      header: '遅れ',
      width: '56px',
      sortable: false,
      render: (item) => item.clientBasicInfo.paymentDelay ?? '-',
      filterValue: (item) => item.clientBasicInfo.paymentDelay ?? '',
    },
    {
      key: 'bicycleNote',
      header: '自転車',
      width: '56px',
      sortable: false,
      render: (item) => item.clientBasicInfo.bicycleNote ?? '-',
      filterValue: (item) => item.clientBasicInfo.bicycleNote ?? '',
    },
    {
      key: 'pension',
      header: '年金',
      width: '64px',
      sortable: false,
      render: (item) => item.clientBasicInfo.pension ?? '-',
      filterValue: (item) => item.clientBasicInfo.pension ?? '',
    },
    {
      key: 'monthlyPaymentDay',
      header: '毎月入金日',
      width: '80px',
      sortable: false,
      render: (item) => item.paymentInfo.monthlyPaymentDay ?? '-',
      filterValue: (item) => item.paymentInfo.monthlyPaymentDay ?? '',
    },
    {
      key: 'settlementProposalDate',
      header: '和解提案予定日',
      width: '100px',
      sortable: false,
      render: (item) => item.settlementInfo.proposalDate ?? '-',
      filterValue: (item) => item.settlementInfo.proposalDate ?? '',
    },
    {
      key: 'postSettlementPaymentCount',
      header: '和解後代弁社数',
      width: '104px',
      align: 'right',
      sortable: false,
      render: (item) =>
        item.settlementInfo.postSettlementPaymentCount != null
          ? `${item.settlementInfo.postSettlementPaymentCount}社`
          : '-',
      filterValue: (item) =>
        item.settlementInfo.postSettlementPaymentCount != null
          ? String(item.settlementInfo.postSettlementPaymentCount)
          : '',
      filterNumber: (item) => item.settlementInfo.postSettlementPaymentCount,
    },
    {
      key: 'nextPaymentDate',
      header: '次回入金日',
      width: '88px',
      sortable: false,
      render: (item) => item.paymentInfo.nextPaymentDate ?? '-',
      filterValue: (item) => item.paymentInfo.nextPaymentDate ?? '',
    },
  ]

  /** 常時定義しておく基本の列（表示するかは columnKeys で決める） */
  const baseColumns: Column<Case>[] = [
    {
      key: 'id',
      header: 'ID',
      width: '76px',
      align: 'center',
      sortable: false,
      render: (item) => item.metadata.externalId ?? '-',
      filterValue: (item) => item.metadata.externalId ?? '',
    },
    {
      key: '_line',
      header: 'LINE',
      width: '48px',
      align: 'center',
      sortable: false,
      render: (item) =>
        item.metadata.lineLinked ? (
          <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-700">済</span>
        ) : (
          <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-400">未</span>
        ),
    },
    {
      key: 'acceptanceDate',
      header: '受任日',
      width: '88px',
      sortable: false,
      render: (item) => item.appointmentInfo.acceptanceDate ?? '-',
      filterValue: (item) => item.appointmentInfo.acceptanceDate ?? '',
    },
    {
      key: 'cautionRank',
      header: '要注意ランク',
      width: '76px',
      align: 'center',
      sortable: false,
      render: (item) => <StatusBadge status={item.clientBasicInfo.cautionRank} size="sm" />,
      filterValue: (item) => item.clientBasicInfo.cautionRank ?? '',
    },
    {
      key: 'listRegisteredDate',
      header: 'リスト登録日',
      width: '104px',
      sortable: false,
      render: (item) => item.metadata.listRegisteredDate ?? '-',
      filterValue: (item) => item.metadata.listRegisteredDate ?? '',
    },
    {
      key: 'listCategory',
      header: 'リスト区分',
      width: '116px',
      sortable: false,
      render: (item) => item.metadata.listCategory ?? '-',
      filterValue: (item) => item.metadata.listCategory ?? '',
    },
    {
      key: 'acceptanceRank',
      header: '受任ランク',
      width: '76px',
      align: 'center',
      sortable: false,
      render: (item) => <StatusBadge status={item.appointmentInfo.acceptanceRank} size="sm" />,
      filterValue: (item) => item.appointmentInfo.acceptanceRank ?? '',
    },
    {
      key: 'debtAdjustmentType',
      header: '債務整理区分',
      width: '88px',
      sortable: false,
      render: (item) => item.appointmentInfo.debtAdjustmentType ?? '-',
      filterValue: (item) => item.appointmentInfo.debtAdjustmentType ?? '',
    },
    {
      key: 'status',
      header: '受任後ステータス',
      width: '128px',
      sortable: false,
      render: (item) => <StatusBadge status={item.settlementInfo.status} size="sm" />,
      filterValue: (item) => item.settlementInfo.status ?? '',
    },
    {
      key: 'name',
      header: '名前',
      width: '148px',
      sortable: false,
      render: (item) => (
        <span className="whitespace-nowrap font-medium">{item.clientBasicInfo.name}</span>
      ),
      filterValue: (item) => item.clientBasicInfo.name ?? '',
    },
    {
      key: 'furigana',
      header: 'フリガナ',
      width: '112px',
      sortable: false,
      render: (item) => {
        const full = item.clientBasicInfo.furigana ?? '-'
        return (
          <span className="whitespace-nowrap text-slate-500" title={full}>
            {clip(item.clientBasicInfo.furigana, 8)}
          </span>
        )
      },
      filterValue: (item) => item.clientBasicInfo.furigana ?? '',
    },
    {
      key: 'phone',
      header: '電話番号',
      width: '108px',
      sortable: false,
      render: (item) => item.clientBasicInfo.phone ?? '-',
      filterValue: (item) => item.clientBasicInfo.phone ?? '',
    },
    {
      key: 'lineUrl',
      header: 'LINE@URL',
      width: '72px',
      align: 'center',
      sortable: false,
      render: (item) =>
        item.clientBasicInfo.lineUrl ? (
          <a
            href={item.clientBasicInfo.lineUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 underline"
          >
            開く
          </a>
        ) : (
          '-'
        ),
    },
    {
      key: 'creditorCount',
      header: '債権社数',
      width: '52px',
      align: 'right',
      sortable: false,
      render: (item) => (
        <span>
          {item.debtInfo.creditorCount ?? '-'}
          <span className="text-slate-400 text-[10px] ml-0.5">社</span>
        </span>
      ),
      filterValue: (item) => (item.debtInfo.creditorCount != null ? String(item.debtInfo.creditorCount) : ''),
      filterNumber: (item) => item.debtInfo.creditorCount,
    },
    {
      key: 'declaredDebtAmount',
      header: '申告債務額',
      width: '104px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.debtInfo.declaredDebtAmount),
      filterValue: (item) => (item.debtInfo.declaredDebtAmount != null ? String(item.debtInfo.declaredDebtAmount) : ''),
      filterNumber: (item) => item.debtInfo.declaredDebtAmount,
    },
    {
      key: 'officeFee',
      header: '事務所報酬（通常）',
      width: '116px',
      align: 'right',
      sortable: false,
      render: (item) => yen(item.feeInfo.officeFee),
      filterValue: (item) => (item.feeInfo.officeFee != null ? String(item.feeInfo.officeFee) : ''),
      filterNumber: (item) => item.feeInfo.officeFee,
    },
    {
      key: 'appointmentStaff',
      header: 'アポ担当',
      width: '72px',
      sortable: false,
      render: (item) => (
        <span
          className="whitespace-nowrap"
          title={item.appointmentInfo.appointmentStaff ?? '-'}
        >
          {clip(item.appointmentInfo.appointmentStaff, 6)}
        </span>
      ),
      filterValue: (item) => item.appointmentInfo.appointmentStaff ?? '',
    },
    {
      key: 'interviewStaff',
      header: '面談担当',
      width: '72px',
      sortable: false,
      render: (item) => (
        <span
          className="whitespace-nowrap"
          title={item.appointmentInfo.interviewStaff ?? '-'}
        >
          {clip(item.appointmentInfo.interviewStaff, 6)}
        </span>
      ),
      filterValue: (item) => item.appointmentInfo.interviewStaff ?? '',
    },
  ]

  // 表示する列を決める。
  //   ・保存した絞り込みが列を指定していれば、その順番どおりに並べる
  //   ・指定が無ければ既定（基本の列のみ・金額列と入力漏れチェック列は非表示）
  const columnPool = new Map<string, Column<Case>>()
  for (const c of [...baseColumns, ...feeColumns, ...checkColumns]) {
    columnPool.set(String(c.key), c)
  }
  const columns: Column<Case>[] =
    columnKeys == null
      ? baseColumns
      : columnKeys.map((k) => columnPool.get(k)).filter((c): c is Column<Case> => !!c)
  // 非表示の列でも並び替えの対象にできるようにする（kintone と同じ挙動）
  const shownKeys = new Set(columns.map((c) => String(c.key)))
  const hiddenSortColumns: Column<Case>[] = [...columnPool.values()]
    .filter((c) => !shownKeys.has(String(c.key)))
    .map((col) => {
      const sortValue = SORT_VALUE[String(col.key)]
      return sortValue ? { ...col, sortValue } : col
    })

  /** 列の選択メニューに出す一覧（グループつき） */
  const columnGroups: { label: string; cols: Column<Case>[] }[] = [
    { label: '基本', cols: baseColumns },
    { label: '追加の項目', cols: checkColumns },
    { label: '報酬・弁代・プール', cols: feeColumns },
  ]
  /** いま選択されている列キー（null のときは既定＝基本の列） */
  const selectedKeys = columnKeys ?? baseColumns.map((c) => String(c.key))
  /** 列のオン/オフ。オンにしたときは「基本 → チェック → 金額」の定義順に差し込む */
  const toggleColumn = (key: string) => {
    const order = [...baseColumns, ...feeColumns, ...checkColumns].map((c) => String(c.key))
    const orderIndex = (k: string) => {
      const i = order.indexOf(k)
      return i < 0 ? order.length : i
    }
    const next = selectedKeys.includes(key)
      ? selectedKeys.filter((k) => k !== key)
      : [...selectedKeys, key].sort((a, b) => orderIndex(a) - orderIndex(b))
    setColumnKeys(next)
  }

  // 並び替えできる列（修正依頼⑭：絞り込みをしていなくてもヘッダークリックで並べ替える）。
  // 並び順を指定していないあいだは No（id）昇順のまま。
  const sortableColumns: Column<Case>[] = columns.map((col) => {
    const sortValue = SORT_VALUE[String(col.key)]
    return sortValue ? { ...col, sortable: true, sortValue } : col
  })

  return (
    <div className="min-h-screen bg-slate-100">
      {/* 絞り込みモーダル（kintone の「絞り込む」相当） */}
      <FilterModal
        open={filterOpen}
        value={filter}
        fields={SEARCH_FIELDS}
        creditorNames={creditorNames}
        onClose={() => setFilterOpen(false)}
        onApply={applyFilter}
        onSave={(q) => {
          // 条件を確定してから保存ダイアログを開く（保存内容と画面を一致させる）
          applyFilter(q)
          setSaveRequestedAt(Date.now())
        }}
      />
      <AppHeader title="司法書士法人 第一法務事務所">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value as SearchField)}
              disabled={results != null}
              className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
            >
              <option value="all">すべて</option>
              <option value="name">依頼者名</option>
              <option value="phone">電話番号</option>
              <option value="prefecture">都道府県</option>
              <option value="status">ステータス</option>
              <option value="staff">担当者</option>
            </select>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="クイック検索..."
              disabled={results != null}
              className="flex-1 max-w-xs text-xs border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
            />
            {searchValue && (
              <button
                onClick={() => setSearchValue('')}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                クリア
              </button>
            )}
            {/* クイック検索と絞り込みの区切り。役割が違うものが並んで見えるという指摘への対応 */}
            <span aria-hidden className="mx-1 h-5 w-px self-center bg-slate-300" />
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className={`rounded border px-3 py-1.5 text-xs font-medium ${
                results != null
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              絞り込む
              {results != null && filter.conditions.length > 0
                ? `（${filter.conditions.length}）`
                : ''}
            </button>
            {results != null && (
              <button
                type="button"
                onClick={clearFilter}
                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                解除
              </button>
            )}

            {/* 表示する列。保存した絞り込みごとに切り替わる（kintone のビュー相当） */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setColumnMenuOpen((v) => !v)}
                title="一覧に表示する列を選びます。「この条件を保存」で絞り込みと一緒に保存されます"
                className={`rounded border px-2 py-1.5 text-xs font-medium ${
                  columnKeys != null
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                表示する列{columnKeys != null ? `（${selectedKeys.length}）` : ''}
              </button>
              {columnMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setColumnMenuOpen(false)}
                    aria-hidden
                  />
                  <div className="absolute right-0 z-50 mt-1 max-h-[70vh] w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-left shadow-lg">
                    <div className="flex items-center justify-between px-1 pb-1">
                      <span className="text-xs font-semibold text-slate-700">表示する列</span>
                      <button
                        type="button"
                        onClick={() => setColumnKeys(null)}
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        既定に戻す
                      </button>
                    </div>
                    {columnGroups.map((g) => (
                      <div key={g.label} className="mb-1">
                        <div className="px-1 py-0.5 text-[10px] font-medium text-slate-400">
                          {g.label}
                        </div>
                        {g.cols.map((c) => {
                          const key = String(c.key)
                          return (
                            <label
                              key={key}
                              className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={selectedKeys.includes(key)}
                                onChange={() => toggleColumn(key)}
                              />
                              {c.header}
                            </label>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 並び順を既定（No 昇順）に戻す。ヘッダークリックは昇順・降順の往復しか
                しないため、戻す手段をここに置く（修正依頼⑭） */}
            {sort && (
              <>
                <span className="mx-1 h-4 w-px bg-slate-300" />
                <button
                  type="button"
                  onClick={() => {
                    setSort(null)
                    setSort2(null)
                  }}
                  title="並び順を既定（No 昇順）に戻します。絞り込み条件はそのままです"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  並び順を戻す
                </button>
              </>
            )}

            {/* 2段目の並び順。1段目（ヘッダークリック）が同じ値の行だけを並べ替える */}
            {sort && (
              <>
                <span className="mx-1 h-4 w-px bg-slate-300" />
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  同順のとき
                  <select
                    value={sort2?.key ?? ''}
                    onChange={(e) =>
                      setSort2(
                        e.target.value
                          ? { key: e.target.value, order: sort2?.order ?? 'asc' }
                          : null
                      )
                    }
                    className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">指定なし</option>
                    {SORT2_OPTIONS.filter((o) => o.key !== sort.key).map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {sort2 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSort2({ key: sort2.key, order: sort2.order === 'asc' ? 'desc' : 'asc' })
                      }
                      title="2段目の昇順・降順を切り替える"
                      className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      {sort2.order === 'asc' ? '昇順' : '降順'}
                    </button>
                  )}
                </label>
              </>
            )}

            <span className="mx-1 h-4 w-px bg-slate-300" />
            {/* 保存した絞り込み条件（全体共有 / 個人用） */}
            <SavedFilterBar
              current={currentPayload}
              activeId={activeFilterId}
              onApply={applySavedFilter}
              onClear={clearFilter}
              fieldLabel={(f) => SEARCH_FIELD_LABEL[f] ?? f}
              saveRequestToken={saveRequestedAt}
            />

            <div className="flex-1" />
            <span className="text-xs text-slate-500">
              {searching
                ? '検索中…'
                : results != null
                  ? `${displayed.length}件（絞り込み中）`
                  : `${filteredCases.length} / 全${cases.length}件`}
            </span>
          </div>

          {/* 最近の絞り込み（直近10件・クリックで再実行）No.147 */}
          {filterHistory.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-slate-400">最近の絞り込み：</span>
              {filterHistory.slice(0, 10).map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setFilter(h)
                    setActiveFilterId(null)
                    void runFilter(h)
                  }}
                  title={filterHistoryLabel(h)}
                  className="max-w-[220px] truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                >
                  {filterHistoryLabel(h)}
                </button>
              ))}
            </div>
          )}
        </div>
      </AppHeader>

      {/* Table */}
      <div className="p-3">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <DataTable
            data={displayed}
            columns={sortableColumns}
            keyField="id"
            sortKey={sort?.key ?? null}
            sortOrder={sort?.order ?? 'asc'}
            onSortChange={(key, order) => setSort(key ? { key, order } : null)}
            sortKey2={sort2?.key ?? null}
            sortOrder2={sort2?.order ?? 'asc'}
            sortOnlyColumns={hiddenSortColumns}
            isRowExpanded={(item) => expanded?.caseId === item.id}
            renderExpandedRow={(item) => (
              <CaseRowDetail
                caseId={item.id}
                showContacts={expanded?.contacts === true}
                showCreditors={expanded?.creditors === true}
                showPayments={expanded?.payments === true}
                showSettlement={expanded?.settlement === true}
              />
            )}
            onRowClick={(item) => navigate(`/cases/${item.id}`)}
            emptyMessage="該当する案件がありません"
            density="compact"
            paginated
            stickyHeader
            enableFind
            persistKey="caseList"
            csvExport="案件一覧"
          />
        </div>
      </div>
    </div>
  )
}
