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
  /** 実データ JSON の読み込み状態 */
  loading: boolean
  loadError: string | null
}

/** LOAD_ALL のペイロード（実行時 fetch した実データ一式） */
export interface CaseDataset {
  cases: Case[]
  creditors: Creditor[]
  contactHistories: ContactHistory[]
  paymentRecords: PaymentRecord[]
}

// Action型
type CaseAction =
  | { type: 'LOAD_ALL'; payload: CaseDataset }
  | { type: 'LOAD_ERROR'; payload: string }
  | { type: 'UPDATE_CASE'; payload: Case }
  | { type: 'UPDATE_CREDITOR'; payload: Creditor }
  | { type: 'ADD_CREDITOR'; payload: Creditor }
  | { type: 'DELETE_CREDITOR'; payload: number }
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
    case 'LOAD_ALL':
      return {
        ...state,
        cases: action.payload.cases,
        creditors: action.payload.creditors,
        contactHistories: action.payload.contactHistories,
        paymentRecords: action.payload.paymentRecords,
        loading: false,
        loadError: null,
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
}

/** DB 接続 API（/api/*、開発時は Vite proxy で Next.js へ中継）から実データを取得 */
async function fetchDataset(): Promise<CaseDataset> {
  const load = async <T,>(path: string): Promise<T> => {
    const res = await fetch(path)
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
    return (await res.json()) as T
  }
  const [cases, creditors, contactHistories, paymentRecords] =
    await Promise.all([
      load<Case[]>('/api/cases'),
      load<Creditor[]>('/api/creditors'),
      load<ContactHistory[]>('/api/contact-histories'),
      load<PaymentRecord[]>('/api/payments'),
    ])
  return { cases, creditors, contactHistories, paymentRecords }
}

// Context
const CaseStateContext = createContext<CaseState | null>(null)
const CaseDispatchContext = createContext<Dispatch<CaseAction> | null>(null)

// Provider
export function CaseProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(caseReducer, initialState)

  useEffect(() => {
    let cancelled = false
    fetchDataset()
      .then((data) => {
        if (!cancelled) dispatch({ type: 'LOAD_ALL', payload: data })
      })
      .catch((err: unknown) => {
        if (!cancelled)
          dispatch({
            type: 'LOAD_ERROR',
            payload: err instanceof Error ? err.message : String(err),
          })
      })
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
