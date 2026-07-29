/**
 * 保存した絞り込み条件（一覧の検索条件に名前を付けて保存・共有する機能）の共有型。
 * サーバ（src/server/savedFilters.ts）とクライアント（useSavedFilters / SavedFilterBar）で共用する。
 *
 * payload には version を持たせている。
 *   version 1 … 旧形式。conditions は { field, value }（値に ">=100000" 等の記法を書く）
 *   version 2 … 現行。filter は演算子つきの FilterQuery（AND/OR も持つ）
 * 旧形式で保存済みの条件も読めるよう、読み込み時に version 2 へ変換する。
 */
import type { Condition } from '../pages/searchFields'
import type { FilterQuery } from './filter'
import { emptyFilterQuery } from './filter'

/** 公開範囲 */
export type SavedFilterScope = 'SHARED' | 'PRIVATE'

/** 対象画面のキー。将来ほかの一覧でも使えるように分けている */
export const SAVED_FILTER_TARGET_CASE_LIST = 'caseList'

/** 案件一覧の並び順（DataTable の sortKey / sortOrder に対応） */
export type CaseListSort = { key: string; order: 'asc' | 'desc' }

/** 案件一覧の保存内容（現行） */
export type CaseListFilterPayload = {
  version: 2
  /** クイック検索（ヘッダーのフィールド選択＋文字列） */
  quick: { field: string; value: string }
  /** 絞り込み条件（演算子つき・AND/OR） */
  filter: FilterQuery
  /** 並び順。null なら既定（No 昇順） */
  sort: CaseListSort | null
}

/** 旧形式（version 1）の保存内容 */
export type CaseListFilterPayloadV1 = {
  version: 1
  quick: { field: string; value: string }
  conditions: Condition[]
  sort: CaseListSort | null
}

/** API が返す保存条件1件 */
export type SavedFilter = {
  id: string
  target: string
  name: string
  description: string | null
  scope: SavedFilterScope
  payload: CaseListFilterPayload | CaseListFilterPayloadV1
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

/** 空の payload（新規作成・壊れたデータのフォールバック） */
export function emptyCaseListPayload(): CaseListFilterPayload {
  return {
    version: 2,
    quick: { field: 'all', value: '' },
    filter: emptyFilterQuery(),
    sort: null,
  }
}

/**
 * 保存済みの payload を現行形式に正規化する。
 * version 1 の `{ field, value }` は「含む（contains）」条件として読み替える。
 * 形が違う・壊れている場合は空の payload を返す。
 */
export function normalizeCaseListPayload(value: unknown): CaseListFilterPayload {
  if (!value || typeof value !== 'object') return emptyCaseListPayload()
  const v = value as Record<string, unknown>

  const rawQuick = (v.quick ?? {}) as Record<string, unknown>
  const quick = {
    field: typeof rawQuick.field === 'string' ? rawQuick.field : 'all',
    value: typeof rawQuick.value === 'string' ? rawQuick.value : '',
  }

  const rawSort = v.sort as Record<string, unknown> | null | undefined
  const sort: CaseListSort | null =
    rawSort && typeof rawSort.key === 'string' && rawSort.key
      ? { key: rawSort.key, order: rawSort.order === 'desc' ? 'desc' : 'asc' }
      : null

  // version 2（現行）
  const rawFilter = v.filter as Record<string, unknown> | undefined
  if (v.version === 2 && rawFilter && Array.isArray(rawFilter.conditions)) {
    return {
      version: 2,
      quick,
      filter: {
        logic: rawFilter.logic === 'or' ? 'or' : 'and',
        conditions: (rawFilter.conditions as FilterQuery['conditions']).filter(
          (c) => c && typeof c.field === 'string' && typeof c.operator === 'string'
        ),
      },
      sort,
    }
  }

  // version 1（旧）… { field, value } を「含む」条件として読み替える
  if (v.version === 1 && Array.isArray(v.conditions)) {
    const legacy = v.conditions as Condition[]
    return {
      version: 2,
      quick,
      filter: {
        logic: 'and',
        conditions: legacy
          .filter((c) => c && typeof c.field === 'string' && typeof c.value === 'string')
          .map((c) => ({ field: c.field, operator: 'contains' as const, values: [c.value] })),
      },
      sort,
    }
  }

  return { ...emptyCaseListPayload(), quick, sort }
}
