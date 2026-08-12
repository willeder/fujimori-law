/**
 * 案件詳細の「編集モード」。
 *
 * 従来は項目を触った瞬間にサーバへ保存していたため、書きかけの内容や
 * 誤クリックまでそのまま記録されていた。ここでは
 *   1. 画面上部の「編集」を押すまで、項目はすべて読み取り専用
 *   2. 編集中の変更は下書き（メモリ上）に貯めるだけでサーバへは送らない
 *   3. 「編集完了」を押したときに、案件・債権者をまとめて保存する
 *   4. 「取消」または画面離脱で下書きを破棄する
 * という流れにする。
 *
 * 対象は案件の項目と債権者タブ。入金スケジュールと接触履歴は行ごとの
 * 追加・削除を伴うため、従来どおり各行の編集ボタンで扱う。
 */
import { createContext, useContext } from 'react'
import type { Case, Creditor } from '../types'

export type CaseEditContextValue = {
  /** 編集モード中かどうか。false の間、項目は読み取り専用 */
  editing: boolean
  /**
   * 案件の変更を下書きへ積む。
   * 未定義なら「下書きを使わない＝その場で保存する」従来動作。
   */
  stageCase?: (updates: Partial<Case>) => void
  /** 債権者の変更を下書きへ積む。未定義なら従来どおりその場で保存する */
  stageCreditor?: (creditor: Creditor, updates: Partial<Creditor>) => void
  /** 未保存の変更があるか（離脱時の警告に使う） */
  dirty: boolean
  /**
   * 他セッションが編集中でロックされているか。
   * true の間は「閲覧はできるが、あらゆる更新操作は不可」。
   * 行ごとの編集ボタン（入金スケジュール・接触履歴）や追加・削除も
   * このフラグを見て無効化する。
   */
  locked: boolean
}

/**
 * 既定値。プロバイダの外側で使われた場合は **従来どおり編集可能**（editing: true）。
 * 案件詳細以外の画面から EditableField 等を再利用しても、
 * 何も設定していないのに読み取り専用になってしまわないようにするため。
 */
const DEFAULT: CaseEditContextValue = {
  editing: true,
  dirty: false,
  locked: false,
}

export const CaseEditContext = createContext<CaseEditContextValue>(DEFAULT)

export function useCaseEdit(): CaseEditContextValue {
  return useContext(CaseEditContext)
}
