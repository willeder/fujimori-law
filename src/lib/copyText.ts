/**
 * 文字のコピーと、コピーしたことを知らせる小さな表示。
 *
 * 事務所からのご要望:
 *   「文字が見切れてるところとかもワンクリックでコピーできたらよい。
 *     ドラッグアンドドロップじゃ見切れてるので全文取得ができない」
 *
 * 一覧のセルは幅に収まらない分を … で省略しているため、画面で見えている
 * ぶんしかドラッグで選べない。省略されているセルを押したときに全文をコピーする。
 */

/** クリップボードへ書き込む。使えない環境向けの保険も入れてある */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const v = text.trim()
  if (!v) return false
  try {
    await navigator.clipboard.writeText(v)
    return true
  } catch {
    // 権限やhttp環境でクリップボードAPIが使えないとき
    try {
      const ta = document.createElement('textarea')
      ta.value = v
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '-1000px'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

let toastEl: HTMLDivElement | null = null
let toastTimer: number | null = null

/**
 * 画面の下中央に「コピーしました」を1.4秒だけ出す。
 * React の状態を使わないので、どの画面からでも呼べて再描画も起こさない。
 */
export function showCopiedToast(message = 'コピーしました'): void {
  if (typeof document === 'undefined') return
  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.setAttribute('role', 'status')
    toastEl.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:24px',
      'transform:translateX(-50%)',
      'z-index:9999',
      'padding:6px 14px',
      'border-radius:6px',
      'background:rgba(15,23,42,.92)',
      'color:#fff',
      'font-size:12px',
      'pointer-events:none',
      'opacity:0',
      'transition:opacity .15s',
    ].join(';')
    document.body.appendChild(toastEl)
  }
  toastEl.textContent = message
  toastEl.style.opacity = '1'
  if (toastTimer != null) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    if (toastEl) toastEl.style.opacity = '0'
  }, 1400)
}

/** 中身が幅に収まらず … で省略されているか */
export function isTruncated(el: HTMLElement | null): boolean {
  if (!el) return false
  return el.scrollWidth > el.clientWidth + 1
}

/**
 * セルの中で省略されている要素を探す。
 * DataTable は中身を truncate 付きの div で包んでいるので、まずそれを見る。
 */
export function findTruncatedInside(cell: HTMLElement): HTMLElement | null {
  if (isTruncated(cell)) return cell
  const kids = cell.querySelectorAll<HTMLElement>('*')
  for (const el of kids) {
    if (isTruncated(el)) return el
  }
  return null
}
