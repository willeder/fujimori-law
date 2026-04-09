/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from 'react'
import type { Case, ContactHistory, Creditor, PaymentRecord } from '../types'
import { mockCases } from '../data/mockCases'
import { mockCreditors } from '../data/mockCreditors'
import { mockContactHistories } from '../data/mockContactHistories'
import { mockPaymentRecords } from '../data/mockPayments'

// State型
interface CaseState {
  cases: Case[]
  creditors: Creditor[]
  contactHistories: ContactHistory[]
  paymentRecords: PaymentRecord[]
  selectedCaseId: number | null
}

// Action型
type CaseAction =
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

// 初期状態
const initialState: CaseState = {
  cases: mockCases,
  creditors: mockCreditors,
  contactHistories: mockContactHistories,
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
