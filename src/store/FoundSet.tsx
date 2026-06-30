/**
 * 検索結果セット（FileMaker の Found Set 相当）。
 * 案件詳細の債権者検索などで「該当する案件群」を保持し、
 * 詳細ページを1件ずつ左右ナビ（◀ ▶）で渡り歩くために使う。
 * ルーター（RouterProvider）の外側で状態を保持するため、画面遷移をまたいで維持される。
 */
import { createContext, useContext, useState, type ReactNode } from 'react'

export type FoundItem = {
  caseId: number
  /** 該当した債権者ID（遷移先で和解状況の該当タブを開くために使用） */
  creditorId?: number
  /** 表示用ラベル（債権者名など） */
  label?: string
}

type FoundSetCtx = {
  items: FoundItem[]
  index: number
  /** 検索の説明（例: 債権者「ポケット」） */
  description: string
  setFoundSet: (items: FoundItem[], description?: string) => void
  setIndex: (i: number) => void
  clear: () => void
}

const Ctx = createContext<FoundSetCtx | null>(null)

export function FoundSetProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FoundItem[]>([])
  const [index, setIndex] = useState(0)
  const [description, setDescription] = useState('')

  const setFoundSet = (it: FoundItem[], desc = '') => {
    setItems(it)
    setIndex(0)
    setDescription(desc)
  }
  const clear = () => {
    setItems([])
    setIndex(0)
    setDescription('')
  }

  return (
    <Ctx.Provider value={{ items, index, description, setFoundSet, setIndex, clear }}>
      {children}
    </Ctx.Provider>
  )
}

export function useFoundSet(): FoundSetCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useFoundSet は FoundSetProvider の内側で使用してください')
  return c
}
