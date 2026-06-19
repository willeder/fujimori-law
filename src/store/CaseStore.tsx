/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
  type Dispatch,
} from 'react'
import type { Case, ContactHistory, Creditor, PaymentRecord } from '../types'

// State型
interface CaseState {
  cases: Case[]
  creditors: Creditor[]
  contactHistories: ContactHistory[]
  paymentRecords: PaymentRecord[]
  selectedCaseId: number | null
  /** cases（一覧）の読み込み状態。これが false になればアプリ表示可 */
  loading: boolean
  loadError: string | null
  /** 接触履歴を取得済みの caseId 集合（重複取得の抑止） */
  loadedHistoryCaseIds: number[]
  /** 入金明細を取得済みの caseId 集合（per-case 取得） */
  loadedPaymentCaseIds: number[]
  /** 債権者を取得済みの caseId 集合（per-case 取得） */
  loadedCreditorCaseIds: number[]
  /** フル案件（詳細用）を取得済みの caseId 集合。一覧はサマリのみ保持 */
  loadedFullCaseIds: number[]
}

// Action型
type CaseAction =
  | { type: 'LOAD_CASES'; payload: Case[] }
  | { type: 'MERGE_CONTACT_HISTORIES'; payload: { caseId: number; rows: ContactHistory[] } }
  | { type: 'MERGE_PAYMENTS'; payload: { caseId: number; rows: PaymentRecord[] } }
  | { type: 'MERGE_CREDITORS'; payload: { caseId: number; rows: Creditor[] } }
  | { type: 'MERGE_FULL_CASE'; payload: Case }
  | { type: 'LOAD_ERROR'; payload: string }
  | { type: 'UPDATE_CASE'; payload: Case }
  | { type: 'UPDATE_CREDITOR'; payload: Creditor }
  | { type: 'ADD_CREDITOR'; payload: Creditor }
  | { type: 'DELETE_CREDITOR'; payload: number }
  | { type: 'REORDER_CREDITORS'; payload: { caseId: number; orderedIds: number[] } }
  | { type: 'UPDATE_CONTACT_HISTORY'; payload: ContactHistory }
  | { type: 'ADD_CONTACT_HISTORY'; payload: ContactHistory }
  | { type: 'DELETE_CONTACT_HISTORY'; payload: number }
  | { type: 'UPDATE_PAYMENT'; payload: PaymentRecord }
  | { type: 'ADD_PAYMENT'; payload: PaymentRecord }
  | { type: 'DELETE_PAYMENT'; payload: number }
  | { type: 'SELECT_CASE'; payload: number | null }

// Reducer
function caseReducer(state: CaseState, action: CaseAction): CaseState {
  switch (action.type) {
    case 'LOAD_CASES':
      return { ...state, cases: action.payload, loading: false, loadError: null }
    case 'MERGE_CREDITORS': {
      const { caseId, rows } = action.payload
      const others = state.creditors.filter((c) => c.caseId !== caseId)
      return {
        ...state,
        creditors: [...others, ...rows],
        loadedCreditorCaseIds: state.loadedCreditorCaseIds.includes(caseId)
          ? state.loadedCreditorCaseIds
          : [...state.loadedCreditorCaseIds, caseId],
      }
    }
    case 'MERGE_CONTACT_HISTORIES': {
      const { caseId, rows } = action.payload
      // 当該 caseId の既存分を除いてから差し替え（重複防止）
      const others = state.contactHistories.filter((h) => h.caseId !== caseId)
      return {
        ...state,
        contactHistories: [...others, ...rows],
        loadedHistoryCaseIds: state.loadedHistoryCaseIds.includes(caseId)
          ? state.loadedHistoryCaseIds
          : [...state.loadedHistoryCaseIds, caseId],
      }
    }
    case 'MERGE_PAYMENTS': {
      const { caseId, rows } = action.payload
      const others = state.paymentRecords.filter((p) => p.caseId !== caseId)
      return {
        ...state,
        paymentRecords: [...others, ...rows],
        loadedPaymentCaseIds: state.loadedPaymentCaseIds.includes(caseId)
          ? state.loadedPaymentCaseIds
          : [...state.loadedPaymentCaseIds, caseId],
      }
    }
    case 'MERGE_FULL_CASE': {
      const full = action.payload
      const exists = state.cases.some((c) => c.id === full.id)
      return {
        ...state,
        cases: exists
          ? state.cases.map((c) => (c.id === full.id ? full : c))
          : [...state.cases, full],
        loadedFullCaseIds: state.loadedFullCaseIds.includes(full.id)
          ? state.loadedFullCaseIds
          : [...state.loadedFullCaseIds, full.id],
      }
    }
    case 'LOAD_ERROR':
      return { ...state, loading: false, loadError: action.payload }
    case 'UPDATE_CASE':
      return {
        ...state,
        cases: state.cases.map((c) =>
          c.id === action.payload.id ? action.payload : c
        ),
      }
    case 'UPDATE_CREDITOR':
      return {
        ...state,
        creditors: state.creditors.map((c) =>
          c.id === action.payload.id ? action.payload : c
        ),
      }
    case 'ADD_CREDITOR':
      return {
        ...state,
        creditors: [...state.creditors, action.payload],
      }
    case 'DELETE_CREDITOR':
      return {
        ...state,
        creditors: state.creditors.filter((c) => c.id !== action.payload),
      }
    case 'REORDER_CREDITORS': {
      // 当該案件の債権者を orderedIds の順に並べ替え、displayOrder を 1 から振り直す。
      // 他案件の債権者・orderedIds に含まれない行（取りこぼし）は温存する。
      const { caseId, orderedIds } = action.payload
      const others = state.creditors.filter((c) => c.caseId !== caseId)
      const mine = state.creditors.filter((c) => c.caseId === caseId)
      const byId = new Map(mine.map((c) => [c.id, c]))
      const reordered: Creditor[] = []
      orderedIds.forEach((id, i) => {
        const c = byId.get(id)
        if (c) reordered.push({ ...c, displayOrder: i + 1 })
      })
      const missing = mine.filter((c) => !orderedIds.includes(c.id))
      return { ...state, creditors: [...others, ...reordered, ...missing] }
    }
    case 'UPDATE_CONTACT_HISTORY':
      return {
        ...state,
        contactHistories: state.contactHistories.map((h) =>
          h.id === action.payload.id ? action.payload : h
        ),
      }
    case 'ADD_CONTACT_HISTORY':
      return {
        ...state,
        contactHistories: [...state.contactHistories, action.payload],
      }
    case 'DELETE_CONTACT_HISTORY':
      return {
        ...state,
        contactHistories: state.contactHistories.filter(
          (h) => h.id !== action.payload
        ),
      }
    case 'UPDATE_PAYMENT':
      return {
        ...state,
        paymentRecords: state.paymentRecords.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      }
    case 'ADD_PAYMENT':
      return {
        ...state,
        paymentRecords: [...state.paymentRecords, action.payload],
      }
    case 'DELETE_PAYMENT':
      return {
        ...state,
        paymentRecords: state.paymentRecords.filter(
          (p) => p.id !== action.payload
        ),
      }
    case 'SELECT_CASE':
      return {
        ...state,
        selectedCaseId: action.payload,
      }
    default:
      return state
  }
}

// 初期状態（実データは実行時 fetch で投入）
const initialState: CaseState = {
  cases: [],
  creditors: [],
  contactHistories: [],
  paymentRecords: [],
  selectedCaseId: null,
  loading: true,
  loadError: null,
  loadedHistoryCaseIds: [],
  loadedPaymentCaseIds: [],
  loadedCreditorCaseIds: [],
  loadedFullCaseIds: [],
}

async function loadJson<T>(path: string, timeoutMs = 25_000): Promise<T> {
  // タイムアウトを設けて「応答が返らず無限ローディング」を防ぐ。
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(path, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
    return (await res.json()) as T
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`${path}: タイムアウト（${timeoutMs / 1000}秒以内に応答なし）`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// fetch はモジュールスコープの Promise を1回だけ生成してキャッシュする。
// 開発時の React StrictMode（マウント→アンマウント→再マウント）でも、
// 各マウントは同じ Promise を購読するだけなので「2回発火」せず、かつ
// 生きているマウントに必ず dispatch される（ガード方式の取りこぼしを回避）。
let casesPromise: Promise<Case[]> | null = null

// Context
const CaseStateContext = createContext<CaseState | null>(null)
const CaseDispatchContext = createContext<Dispatch<CaseAction> | null>(null)

// Provider
export function CaseProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(caseReducer, initialState)

  useEffect(() => {
    let cancelled = false
    // 1) まず cases だけ取得（これでアプリ表示）
    if (!casesPromise) casesPromise = loadJson<Case[]>('/api/cases')
    casesPromise
      .then((cases) => {
        if (!cancelled) dispatch({ type: 'LOAD_CASES', payload: cases })
      })
      .catch((err: unknown) => {
        // 失敗したキャッシュPromiseを破棄し、再試行（再マウント/再読み込み）で
        // 必ず再フェッチされるようにする（失敗状態の固着を防ぐ）。
        casesPromise = null
        if (!cancelled)
          dispatch({
            type: 'LOAD_ERROR',
            payload: err instanceof Error ? err.message : String(err),
          })
      })
    // creditors / payments / contactHistories は起動時に全件ロードしない。
    //  - 案件詳細: それぞれ caseId 絞り込みで per-case 取得（useEnsure*）
    //  - 入金管理/差異: サーバ集計API
    //  - 和解実績一覧: そのページを開いた時に全件取得
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <CaseStateContext.Provider value={state}>
      <CaseDispatchContext.Provider value={dispatch}>
        {children}
      </CaseDispatchContext.Provider>
    </CaseStateContext.Provider>
  )
}

export function useCaseStateContext() {
  const context = useContext(CaseStateContext)
  if (!context) throw new Error('useCaseState must be used within CaseProvider')
  return context
}

export function useCaseDispatchContext() {
  const context = useContext(CaseDispatchContext)
  if (!context)
    throw new Error('useCaseDispatch must be used within CaseProvider')
  return context
}
