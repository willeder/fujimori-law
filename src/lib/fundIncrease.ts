/**
 * 原資UP対応の「案件としての状態」。
 *
 * 事務所の運用（2026-09-02）:
 *   申告額より実債務額が大きい案件が出たとき、依頼者と話して弁済原資を上げる。
 *   その要否と進み具合を残す。
 *
 * 経緯:
 *   ・2026-09-02 債権者ごとに記録し、案件の状態は各社の値からまとめていた。
 *   ・2026-09-08（Rei）「対応中」を追加。要（未着手）→ 対応中 → 完了 の3段階。
 *   ・2026-09-17（Rei）「和解状況タブ内の各社タブにある『原資UP対応』は削除」
 *     「すべて合算タブにある『原資UP対応』を編集できるようにしてほしい
 *       （選択肢は、削除したフィールドと同一）」
 *     → 案件単位で1つの値を持ち、すべて合算タブで直接選ぶ形にした。
 *       各社の値からまとめる処理は不要になったので、値をそのまま状態にする。
 *
 * 選択肢は constants/fieldOptions.ts の FUND_INCREASE_ACTION_OPTIONS（要 / 対応中 / 完了）。
 */
export type FundIncreaseState = 'required' | 'inProgress' | 'done' | 'none'

export const FUND_INCREASE_LABEL: Record<FundIncreaseState, string | null> = {
  required: '原資UP対応要',
  inProgress: '原資UP対応中',
  done: '原資UP対応済',
  none: null,
}

/**
 * 「原資UP対応」という見出しの下に置くときの短い表記。
 * 見出しと値で同じ言葉を繰り返さないぶん、狭い枠でも折り返さない。
 */
export const FUND_INCREASE_SHORT_LABEL: Record<FundIncreaseState, string | null> = {
  required: '要',
  inProgress: '対応中',
  done: '済',
  none: null,
}

/** 案件の原資UP対応の値（'要' / '対応中' / '完了' / 空欄）を状態に読み替える */
export function fundIncreaseStateOf(action: string | null | undefined): FundIncreaseState {
  if (action === '要') return 'required'
  if (action === '対応中') return 'inProgress'
  if (action === '完了') return 'done'
  return 'none'
}
