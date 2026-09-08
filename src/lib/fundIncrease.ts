/**
 * 原資UP対応の「案件としての状態」を、各社の値からまとめる。
 *
 * 事務所の運用（2026-09-02）:
 *   申告額より実債務額が大きい社が出たとき、依頼者と話して弁済原資を上げる。
 *   要否と完了は債権者ごとに残し、案件のまとめは各社の値から出す。
 *
 * まとめ方（Rei 2026-09-08 に「対応中」を追加。優先順位もこのとき確認）:
 *   ・1社でも「要」があれば → 対応要（赤太字）
 *   ・「要」が無く、「対応中」が1社以上あれば → 対応中（オレンジ）
 *   ・上のどちらも無く、「完了」が1社以上あれば → 対応済（黒字）
 *   ・どれも無ければ（全社空欄）→ 何も出さない
 *
 * 「要」を「対応中」より優先するのは、未着手の社が1社でも残っているうちは
 * 対応漏れを見逃さないため（着手済みに見えてしまうと拾えなくなる）。
 *
 * ※「完了」の判定を『受任対象の全社が完了』にしていない理由:
 *   空欄が既定で、原資UPと関係の無い社まで「完了」に変えて回らないと
 *   対応済にならなくなるため。関係する社にだけ印を付ける運用に合わせている。
 *   全社完了を条件にしたい場合はここだけ直せば全画面に反映される。
 *
 * 集計対象は受任対象（＝「受任対象外」以外）の債権者のみ。原資UPの判定自体が
 * 受任対象の合計で行われているため、そちらと母集団を揃える。
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
 * 見出しと値で同じ言葉を繰り返さないぶん、狭い枠でも折り返さない
 * （文字サイズ「大」＋幅の狭い画面で、長い方は枠からはみ出していた）。
 */
export const FUND_INCREASE_SHORT_LABEL: Record<FundIncreaseState, string | null> = {
  required: '要',
  inProgress: '対応中',
  done: '済',
  none: null,
}

export function fundIncreaseState(
  creditors: { status?: string | null; fundIncreaseAction?: string | null }[]
): FundIncreaseState {
  let inProgress = 0
  let done = 0
  for (const c of creditors) {
    if (c.status === '受任対象外') continue
    if (c.fundIncreaseAction === '要') return 'required'
    if (c.fundIncreaseAction === '対応中') inProgress += 1
    else if (c.fundIncreaseAction === '完了') done += 1
  }
  return inProgress > 0 ? 'inProgress' : done > 0 ? 'done' : 'none'
}
