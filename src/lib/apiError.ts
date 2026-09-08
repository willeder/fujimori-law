/**
 * 失敗したときに画面へ出す文言を作る。
 *
 * 事務所からのご要望（Rei 2026-09-08）:
 *   「アラートにより詳細なエラー内容をだす」
 *
 * これまでは「保存に失敗しました」「戻せませんでした」のように、何が起きたか
 * 分からない文言だけを出している箇所があった。原因が分からないと事務所側で
 * 判断できず、こちらに聞くまで先へ進めない（今回のCSV出力もそうだった）。
 *
 * そこで、失敗したときは必ず
 *   1行目: 何ができなかったか（利用者に分かる言葉）
 *   2行目: サーバが返した理由 ＋ HTTPステータス
 * の2段で出す。2行目は事務所からご連絡いただくときそのまま貼っていただける。
 *
 * サーバ側は基本 { "error": "..." } を返すが、経路によっては素のテキストや
 * HTML（プラットフォームのエラーページ）が返ることもあるので、両方拾う。
 */

/** 長すぎる本文はアラートに収まらないので頭だけ使う */
const MAX = 500

/** 例外（通信断・JSON崩れなど）を1行の文にする */
export function errorText(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as { cause?: { code?: string } }).cause?.code
    return code ? `${e.message}（${code}）` : e.message
  }
  return String(e)
}

/**
 * レスポンスから理由を取り出す。本文は1回しか読めないので、
 * 呼び出し側で先に読んでいる場合は body に渡すこと。
 */
export async function apiErrorMessage(
  r: Response,
  fallback: string,
  body?: unknown
): Promise<string> {
  let detail = ''
  try {
    if (body !== undefined) {
      const b = body as { error?: string; message?: string } | string | null
      detail = typeof b === 'string' ? b : (b?.error ?? b?.message ?? '')
    } else {
      const text = await r.text()
      if (text) {
        try {
          const j = JSON.parse(text) as { error?: string; message?: string }
          detail = j.error ?? j.message ?? text
        } catch {
          // JSON でなければ本文をそのまま（HTMLのエラーページなど）
          detail = text
        }
      }
    }
  } catch {
    /* 本文が読めないこともある。その場合はステータスだけ出す */
  }
  // HTMLが返ったときはタグだらけになるので、目印だけ残す
  if (/^\s*<(!doctype|html)/i.test(detail)) detail = 'サーバがHTMLを返しました'
  detail = detail.replace(/\s+/g, ' ').trim().slice(0, MAX)
  return detail ? `${fallback}\n${detail}（HTTP ${r.status}）` : `${fallback}\n（HTTP ${r.status}）`
}

/** レスポンスの失敗をそのままアラートで見せる */
export async function alertApiError(r: Response, fallback: string, body?: unknown): Promise<void> {
  window.alert(await apiErrorMessage(r, fallback, body))
}

/** 例外（通信できなかった等）をアラートで見せる */
export function alertThrown(e: unknown, fallback: string): void {
  window.alert(`${fallback}\n${errorText(e)}`)
}
