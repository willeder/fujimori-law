import { useMemo } from 'react'
import {
  useCaseDispatchContext,
  useCaseStateContext,
} from './CaseStore'
import { buildCreditorScheduleForCase } from '../services/payment/creditorSchedule'

export function useCaseState() {
  return useCaseStateContext()
}

export function useCaseDispatch() {
  return useCaseDispatchContext()
}

/** 実データ JSON の読み込み状態 */
export function useCaseLoading() {
  const { loading, loadError } = useCaseStateContext()
  return { loading, loadError }
}

export function useCase(id: number) {
  const { cases } = useCaseState()
  return cases.find((c) => c.id === id)
}

export function useCreditorsByCaseId(caseId: number) {
  const { creditors } = useCaseState()
  return creditors.filter((c) => c.caseId === caseId)
}

/**
 * 案件の入金明細を返す。
 * 「案件全体の入金（creditorId == null）」に加え、表示中の案件に限り
 * 債権者別の弁済スケジュール（合算実績をFIFO充当した推定）を実行時に算出して合成する。
 * これにより各債権者タブが埋まる。JSON 側は肥大化させない。
 */
export function usePaymentsByCaseId(caseId: number) {
  const { paymentRecords, creditors } = useCaseState()
  return useMemo(() => {
    const caseLevel = paymentRecords.filter((p) => p.caseId === caseId)
    const caseCreditors = creditors.filter((c) => c.caseId === caseId)
    const creditorRows = buildCreditorScheduleForCase(caseCreditors, caseLevel)
    return [...caseLevel, ...creditorRows]
  }, [paymentRecords, creditors, caseId])
}

export function useContactHistoriesByCaseId(caseId: number) {
  const { contactHistories } = useCaseState()
  return contactHistories.filter((h) => h.caseId === caseId)
}

