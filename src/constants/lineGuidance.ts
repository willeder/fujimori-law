/**
 * LINE連携の案内文テンプレート（サーバ・画面の共通定義）。
 *
 * 依頼者には「このメッセージ全文をコピーしてそのまま返信」してもらう運用のため、
 * 案内文の本文そのものが照合キーになる。文面を変えるときは必ずこのファイルだけを
 * 直すこと（画面側の案内文と Webhook 側の照合が同じ定義を参照している）。
 *
 * 照合は「全文一致」だが、コピー時に改行や空白が落ちる・全角半角が変わる程度の
 * ゆらぎは吸収する（normalizeGuidance で空白を除去し NFKC 正規化してから比較）。
 * 通常の会話がこの文面と一致することはないので、誤爆の心配はない。
 */

/**
 * 案内文。{CODE} が登録コード（英数字8桁）に置き換わる。
 *
 * 末尾は期限を約束しない言い回しにしている。登録コードの実際の有効期限は
 * 発行から90日（src/server/handlers.ts の issueLineCode）で、翌日以降の返信でも
 * 問題なく連携できるため、「当日中に」と書くと実態と食い違うため。
 */
export const GUIDANCE_TEMPLATE = `【ご案内】
社内システムの刷新により、今後は入金のお知らせを自動で送信するにあたり、依頼者様のLINEアカウントと連携させていただいております。

こちらのメッセージ全文をコピーしていただき、そのままご返信をお願いします。

{CODE}

お早めにご返信をお待ちしております。`

/**
 * 照合に使う案内文の一覧（新しい順）。
 * 文面を変えると、変更前に案内済みの依頼者が返信しても一致しなくなるため、
 * 旧文面もここに残して受け付ける。運用上もう使われなくなったら削除してよい。
 */
export const ACCEPTED_GUIDANCE_TEMPLATES: string[] = [
  GUIDANCE_TEMPLATE,
  // 〜2026-08-06 の文面（末尾が「当日中に、ご返信をお待ちしております。」）
  `【ご案内】
社内システムの刷新により、今後は入金のお知らせを自動で送信するにあたり、依頼者様のLINEアカウントと連携させていただいております。

こちらのメッセージ全文をコピーしていただき、そのままご返信をお願いします。

{CODE}

当日中に、ご返信をお待ちしております。`,
]

/** 登録コードを差し込んだ案内文を作る（送信は常に最新の文面） */
export function buildGuidance(code: string): string {
  return GUIDANCE_TEMPLATE.replace('{CODE}', code)
}

/**
 * 照合用の正規化。
 * 全角英数字などを NFKC で半角に寄せ、空白・改行・タブをすべて除去する。
 * LINE のコピー&ペーストで改行が詰まる／余分な空白が入る程度の差異を吸収するため。
 */
export function normalizeGuidance(s: string): string {
  return (s ?? '').normalize('NFKC').replace(/[\s　]+/g, '')
}

/** 正規表現メタ文字のエスケープ */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 案内文の全文一致を判定し、含まれている登録コードを取り出す。
 * 一致しなければ null（＝通常の会話とみなして無反応にする）。
 */
export function extractCodeFromGuidance(raw: string): string | null {
  const body = normalizeGuidance(raw)
  if (!body) return null
  for (const tpl of ACCEPTED_GUIDANCE_TEMPLATES) {
    const pattern =
      '^' +
      escapeRe(normalizeGuidance(tpl)).replace(
        escapeRe('{CODE}'),
        '([0-9A-Za-z]{8})'
      ) +
      '$'
    const m = body.match(new RegExp(pattern))
    if (m) return m[1].toUpperCase()
  }
  return null
}
