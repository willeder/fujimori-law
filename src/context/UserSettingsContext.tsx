import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'fujimori-law-user-settings'

interface UserSettings {
  accountName: string
}

function readStoredSettings(): UserSettings {
  if (typeof window === 'undefined') return { accountName: '' }
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v) {
      const parsed = JSON.parse(v) as Partial<UserSettings>
      return { accountName: parsed.accountName ?? '' }
    }
  } catch {
    /* ignore */
  }
  return { accountName: '' }
}

type UserSettingsContextValue = {
  accountName: string
  setAccountName: (name: string) => void
}

const UserSettingsContext = createContext<UserSettingsContextValue | null>(null)

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(() => readStoredSettings())

  const setAccountName = useCallback((name: string) => {
    setSettings((prev) => {
      const next = { ...prev, accountName: name }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ accountName: settings.accountName, setAccountName }),
    [settings.accountName, setAccountName]
  )

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>
}

export function useUserSettings(): UserSettingsContextValue {
  const ctx = useContext(UserSettingsContext)
  if (ctx == null) {
    throw new Error('useUserSettings must be used within UserSettingsProvider')
  }
  return ctx
}
