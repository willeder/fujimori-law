/**
 * 認証コンテキスト。現在のユーザー取得・ログイン・ログアウトを提供。
 * 初回マウントで /api/auth/me を叩いてセッションを復元する。
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type AuthUser = {
  id: string
  email: string
  name: string | null
  role: 'ADMIN' | 'STAFF'
  status: 'ACTIVE' | 'DISABLED'
  lastLoginAt: string | null
}

type AuthState = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthCtx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = (await res.json()) as { user: AuthUser }
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 初回マウントでセッション復元（refresh 内の setState は await 後の非同期）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        user?: AuthUser
        error?: string
      }
      if (res.ok && data.user) {
        setUser(data.user)
        return { ok: true }
      }
      return { ok: false, error: data.error ?? 'ログインに失敗しました' }
    } catch {
      return { ok: false, error: '通信エラーが発生しました' }
    }
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  )
}

// Context のフックは同居させる（Provider と密結合のため）
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth は AuthProvider の内側で使用してください')
  return ctx
}
