import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from 'react'
import type { Case, Creditor, PaymentRecord } from '../types'
import { mockCases } from '../data/mockCases'
import { mockCreditors } from '../data/mockCreditors'
import { mockPaymentRecords } from '../data/mockPayments'

// State型
interface CaseState {
  cases: Case[]
  creditors: Creditor[]
  paymentRecords: PaymentRecord[]
  selectedCaseId: number | null
}

// Action型
type CaseAction =
  | { type: 'UPDATE_CASE'; payload: Case }
  | { type: 'UPDATE_CREDITOR'; payload: Creditor }
  | { type: 'ADD_CREDITOR'; payload: Creditor }
  | { type: 'DELETE_CREDITOR'; payload: number }
  | { type: 'UPDATE_PAYMENT'; payload: PaymentRecord }
  | { type: 'ADD_PAYMENT'; payload: PaymentRecord }
  | { type: 'DELETE_PAYMENT'; payload: number }
  | { type: 'SELECT_CASE'; payload: number | null }

// Reducer
function caseReducer(state: CaseState, action: CaseAction): CaseState {
  switch (action.type) {
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

// 初期状態
const initialState: CaseState = {
  cases: mockCases,
  creditors: mockCreditors,
  paymentRecords: mockPaymentRecords,
  selectedCaseId: null,
}

// Context
const CaseStateContext = createContext<CaseState | null>(null)
const CaseDispatchContext = createContext<Dispatch<CaseAction> | null>(null)

// Provider
export function CaseProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(caseReducer, initialState)

  return (
    <CaseStateContext.Provider value={state}>
      <CaseDispatchContext.Provider value={dispatch}>
        {children}
      </CaseDispatchContext.Provider>
    </CaseStateContext.Provider>
  )
}

// Hooks
export function useCaseState() {
  const context = useContext(CaseStateContext)
  if (!context) {
    throw new Error('useCaseState must be used within CaseProvider')
  }
  return context
}

export function useCaseDispatch() {
  const context = useContext(CaseDispatchContext)
  if (!context) {
    throw new Error('useCaseDispatch must be used within CaseProvider')
  }
  return context
}

// Selector hooks
export function useCase(id: number) {
  const { cases } = useCaseState()
  return cases.find((c) => c.id === id)
}

export function useCreditorsByCaseId(caseId: number) {
  const { creditors } = useCaseState()
  return creditors.filter((c) => c.caseId === caseId)
}

export function usePaymentsByCaseId(caseId: number) {
  const { paymentRecords } = useCaseState()
  return paymentRecords.filter((p) => p.caseId === caseId)
}
