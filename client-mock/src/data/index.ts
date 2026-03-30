/**
 * モックデータ - エクスポート
 */

export { mockCases } from './mockCases'
export { mockCreditors, getCreditorsByCaseId, getCreditorNames } from './mockCreditors'
export {
  mockPaymentRecords,
  getPaymentRecordsByCaseId,
  getPendingPayments,
  getCompletedPayments,
} from './mockPayments'

export type * from '../types/case'
