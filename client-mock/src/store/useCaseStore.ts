import {
  useCaseDispatchContext,
  useCaseStateContext,
} from './CaseStore'

export function useCaseState() {
  return useCaseStateContext()
}

export function useCaseDispatch() {
  return useCaseDispatchContext()
}

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

