/**
 * タブ単位のクライアントID。
 *
 * 同時編集の検知はこれまでメールアドレスで行っていたため、
 * 「同じアカウントを2つのウィンドウで開いている」場合に相手を検知できず、
 * 保存も警告なしで後勝ち上書きになっていた（事務所でアカウントを共有していると
 * 2人が同じ案件を触っても誰も気づけない）。
 *
 * sessionStorage はタブごとに独立しているため、
 *   - 同じブラウザの別タブ  → 別ID（＝別セッションとして検知される）
 *   - リロード              → 同じID（自分自身を誤検知しない）
 *   - タブを閉じる          → 破棄
 * となり、アカウントが同じでもウィンドウ単位で識別できる。
 */
const KEY = 'app.clientId'

let cached: string | null = null

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* 非対応環境ではフォールバックする */
  }
  return 'c-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

export function getClientId(): string {
  if (cached) return cached
  try {
    const saved = sessionStorage.getItem(KEY)
    if (saved) {
      cached = saved
      return saved
    }
    const id = randomId()
    sessionStorage.setItem(KEY, id)
    cached = id
    return id
  } catch {
    // プライベートモード等で sessionStorage が使えない場合はメモリ内だけで保持する
    cached = cached ?? randomId()
    return cached
  }
}
