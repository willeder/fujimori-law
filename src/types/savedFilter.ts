/**
 * 保存した絞り込み条件（一覧の検索条件に名前を付けて保存・共有する機能）の共有型。
 * サーバ（src/server/savedFilters.ts）とクライアント（useSavedFilters / SavedFilterBar）で共用する。
 */
import type { Condition } from '../pages/searchFields'

/** 公開範囲 */
export type SavedFilterScope = 'SHARED' | 'PRIVATE'

/** 対象画面のキー。将来ほかの一覧でも使えるように分けている */
export const SAVED_FILTER_TARGET_CASE_LIST = 'caseList'

/** 案件一覧の並び順（DataTable の sortKey / sortOrder に対応） */
export type CaseListSort = { key: string; order: 'asc' | 'desc' }

/**
 * 案件一覧の保存内容。
 * version は将来スキーマを変えたときの移行用（読み込み時に判定する）。
 */
export type CaseListFilterPayload = {
  version: 1
  /** クイック検索（ヘッダーのフィールド選択＋文字列） */
  quick: { field: string; value: string }
  /** 詳細検索の条件（複数条件AND） */
  conditions: Condition[]
  /** 並び順。null なら既定（No 昇順） */
  sort: CaseListSort | null
}

/** API が返す保存条件1件 */
export type SavedFilter = {
  id: string
  target: string
  name: string
  description: string | null
  scope: SavedFilterScope
  payload: CaseListFilterPayload
  sortOrder: number
  ownerId: string
  /** 作成者の表示名（未設定ならメールアドレス） */
  ownerLabel: string
  /** ログイン中のユーザーがこの条件を編集・削除できるか（サーバが判定） */
  canEdit: boolean
  createdAt: string
  updatedAt: string
}

/** 保存・更新時にクライアントが送る内容 */
export type SavedFilterInput = {
  target?: string
  name: string
  description?: string | null
  scope: SavedFilterScope
  payload: CaseListFilterPayload
  sortOrder?: number
}

/** payload が期待する形かを判定する（保存済みデータの読み込み時の防御） */
export function isCaseListPayload(value: unknown): value is CaseListFilterPayload {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<CaseListFilterPayload>
  return v.version === 1 && Array.isArray(v.conditions)
}

/** 空の payload（新規作成・壊れたデータのフォールバック） */
export function emptyCaseListPayload(): CaseListFilterPayload {
  return { version: 1, quick: { field: 'all', value: '' }, conditions: [], sort: null }
}
