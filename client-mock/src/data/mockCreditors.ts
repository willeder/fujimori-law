/**
 * 債権者モック — docs/data の xlsx「和解処理」から生成
 * 再生成: リポジトリルートで `python3 scripts/generate_mock_from_docs.py`
 */
import type { Creditor } from '../types/case'
import { mockCreditorsFromDocs } from './mockCreditorsFromDocs'

export const mockCreditors: Creditor[] = mockCreditorsFromDocs

/** 案件IDで債権者を取得 */
export function getCreditorsByCaseId(caseId: number): Creditor[] {
  return mockCreditors.filter((c) => c.caseId === caseId)
}

/** 債権者名の一覧（タブ用） */
export function getCreditorNames(caseId: number): string[] {
  return getCreditorsByCaseId(caseId).map((c) => c.creditorName)
}
