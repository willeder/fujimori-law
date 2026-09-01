import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'

export type UiFontScale = 'large' | 'standard' | 'compact' | 'dense'

const STORAGE_KEY = 'fujimori-law-ui-font-scale'

const SCALES: readonly UiFontScale[] = ['large', 'standard', 'compact', 'dense']

const isScale = (v: unknown): v is UiFontScale =>
  typeof v === 'string' && (SCALES as readonly string[]).includes(v)

/** 未ログイン時やサーバに未設定のときの既定 */
const DEFAULT_SCALE: UiFontScale = 'standard'

function readStoredScale(): UiFontScale {
  if (typeof window === 'undefined') return DEFAULT_SCALE
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (isScale(v)) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_SCALE
}

type UiFontScaleContextValue = {
  scale: UiFontScale
  setScale: (next: UiFontScale) => void
}

const UiFontScaleContext = createContext<UiFontScaleContextValue | null>(null)

/**
 * 画面全体の文字サイズ。
 *
 * 設定はアカウントごとにサーバへ保存する（堀本様 2026-08-23 のご要望）。
 * ブラウザ側にも控えを残しておき、ログイン前や通信できないときはそちらを使う。
 * これで、同じPCを共有しても人ごとに設定が分かれ、端末を変えても引き継がれる。
 */
export function UiFontScaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [scale, setScaleState] = useState<UiFontScale>(() => readStoredScale())
  // サーバの値を取り込むのはログインごとに一度だけ。
  // 取り込んだあとに本人が変えた設定を、再取得で上書きしないため。
  const adoptedForUser = useRef<string | null>(null)

  useEffect(() => {
    if (!user) {
      adoptedForUser.current = null
      return
    }
    if (adoptedForUser.current === user.id) return
    adoptedForUser.current = user.id
    if (isScale(user.uiFontScale)) {
      setScaleState(user.uiFontScale)
      try {
        window.localStorage.setItem(STORAGE_KEY, user.uiFontScale)
      } catch {
        /* ignore */
      }
    }
  }, [user])

  const setScale = useCallback(
    (next: UiFontScale) => {
      setScaleState(next)
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      if (!user) return
      // 保存に失敗しても画面はそのまま。次に開いたときはブラウザ側の控えが使われる。
      void fetch('/api/auth/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiFontScale: next }),
      }).catch(() => {})
    },
    [user]
  )

  useLayoutEffect(() => {
    document.documentElement.dataset.uiFontScale = scale
  }, [scale])

  const value = useMemo(() => ({ scale, setScale }), [scale, setScale])

  return <UiFontScaleContext.Provider value={value}>{children}</UiFontScaleContext.Provider>
}

export function useUiFontScale(): UiFontScaleContextValue {
  const ctx = useContext(UiFontScaleContext)
  if (ctx == null) {
    throw new Error('useUiFontScale must be used within UiFontScaleProvider')
  }
  return ctx
}
