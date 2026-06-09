import { useEffect, useMemo } from 'react'
import {
  useCaseDispatchContext,
  useCaseStateContext,
} from './CaseStore'
import type { Case, ContactHistory, Creditor, PaymentRecord } from '../types'
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

/** 案件詳細で、その案件の債権者を遅延取得して store にマージする（全件ロード回避） */
export function useEnsureCreditors(caseId: number) {
  const { loadedCreditorCaseIds } = useCaseStateContext()
  const dispatch = useCaseDispatchContext()
  const loaded = loadedCreditorCaseIds.includes(caseId)
  useEffect(() => {
    if (!Number.isFinite(caseId) || loaded) return
    let cancelled = false
    fetch(`/api/creditors?caseId=${caseId}`)
      .then((r) => (r.ok ? (r.json() as Promise<Creditor[]>) : []))
      .then((rows) => {
        if (!cancelled) dispatch({ type: 'MERGE_CREDITORS', payload: { caseId, rows } })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [caseId, loaded, dispatch])
}

/**
 * 案件詳細で、その案件の接触履歴を遅延取得して store にマージする。
 * 全件ロードを避けるための per-case フェッチ（取得済みなら何もしない）。
 */
export function useEnsureContactHistories(caseId: number) {
  const { loadedHistoryCaseIds } = useCaseStateContext()
  const dispatch = useCaseDispatchContext()
  const loaded = loadedHistoryCaseIds.includes(caseId)
  useEffect(() => {
    if (!Number.isFinite(caseId) || loaded) return
    let cancelled = false
    fetch(`/api/contact-histories?caseId=${caseId}`)
      .then((r) => (r.ok ? (r.json() as Promise<ContactHistory[]>) : []))
      .then((rows) => {
        if (!cancelled)
          dispatch({ type: 'MERGE_CONTACT_HISTORIES', payload: { caseId, rows } })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [caseId, loaded, dispatch])
}

/**
 * 案件詳細で、フル案件データを遅延取得して store にマージする。
 * 一覧はサマリのみ保持するため、詳細では単件フルを取得する。
 * @returns フルデータ取得済みなら true
 */
export function useEnsureFullCase(caseId: number): boolean {
  const { loadedFullCaseIds } = useCaseStateContext()
  const dispatch = useCaseDispatchContext()
  const loaded = loadedFullCaseIds.includes(caseId)
  useEffect(() => {
    if (!Number.isFinite(caseId) || loaded) return
    let cancelled = false
    fetch(`/api/cases/${caseId}`)
      .then((r) => (r.ok ? (r.json() as Promise<Case | null>) : null))
      .then((full) => {
        if (!cancelled && full) dispatch({ type: 'MERGE_FULL_CASE', payload: full })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [caseId, loaded, dispatch])
  return loaded
}

/** 案件詳細で、その案件の入金明細を遅延取得して store にマージする（全件ロード回避） */
export function useEnsurePayments(caseId: number) {
  const { loadedPaymentCaseIds } = useCaseStateContext()
  const dispatch = useCaseDispatchContext()
  const loaded = loadedPaymentCaseIds.includes(caseId)
  useEffect(() => {
    if (!Number.isFinite(caseId) || loaded) return
    let cancelled = false
    fetch(`/api/payments?caseId=${caseId}`)
      .then((r) => (r.ok ? (r.json() as Promise<PaymentRecord[]>) : []))
      .then((rows) => {
        if (!cancelled) dispatch({ type: 'MERGE_PAYMENTS', payload: { caseId, rows } })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [caseId, loaded, dispatch])
}

