import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type UiFontScale = 'large' | 'standard' | 'compact' | 'dense'

const STORAGE_KEY = 'fujimori-law-ui-font-scale'

function readStoredScale(): UiFontScale {
  if (typeof window === 'undefined') return 'standard'
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'large' || v === 'compact' || v === 'dense' || v === 'standard') return v
  } catch {
    /* ignore */
  }
  return 'standard'
}

type UiFontScaleContextValue = {
  scale: UiFontScale
  setScale: (next: UiFontScale) => void
}

const UiFontScaleContext = createContext<UiFontScaleContextValue | null>(null)

export function UiFontScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<UiFontScale>(() => readStoredScale())

  const setScale = useCallback((next: UiFontScale) => {
    setScaleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

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
