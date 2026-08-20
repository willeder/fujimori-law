/**
 * 氏名・フリガナ検索の表記ゆれ吸収。
 *
 * kintone から来たデータは「山田＿太郎」（＿は全角スペース）「ヤマダ＿タロウ」のように
 * 姓と名の間に **全角スペース** が入っている。
 * 事務所からの指摘（修正依頼⑱）:
 *   「フリガナ検索で全角スペースを入れないと引っかからない」
 * → 検索語と対象の双方から空白を落として突き合わせる。
 *
 * 併せて次も吸収する（どれも「探しているのに出ない」の原因になる）:
 *   - 半角カナ（ﾔﾏﾀﾞ）／全角英数（ＡＢＣ）  … NFKC で統一
 *   - ひらがな（やまだ）／カタカナ（ヤマダ） … ひらがな→カタカナに寄せる
 *   - 大文字小文字                            … 小文字に寄せる
 *
 * 電話番号には使わない。ハイフン込みの文字列のまま照合する現行仕様を維持する
 * （数字だけに正規化すると「90169E」が電話番号「90169」に化けて別案件を拾うため）。
 */
export function normalizeNameText(s: string | null | undefined): string {
  if (!s) return ''
  let t = String(s).normalize('NFKC').toLowerCase()
  // ひらがな → カタカナ（U+3041〜U+3096 は +0x60 でカタカナになる）
  t = t.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
  // 空白（半角・全角・タブ等）と中黒を除去
  t = t.replace(/[\s・]/g, '')
  return t
}

/** 正規化した上での部分一致。query は呼び出し側で正規化済みの文字列を渡す。 */
export function includesNormalized(target: string | null | undefined, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  return normalizeNameText(target).includes(normalizedQuery)
}
