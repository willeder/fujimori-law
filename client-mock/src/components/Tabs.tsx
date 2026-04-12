import { useState, type ReactNode } from 'react'
import type { CreditorTabAccent } from '../lib/creditorTabAccent'

export interface TabItem {
  id: string
  label: string
  badge?: number | string
  content: ReactNode
  /** 左ストライプ・背景でタブを識別（和解対象債権など） */
  accent?: CreditorTabAccent
}

/**
 * - none: 従来どおり
 * - host: タブ見出し固定＋最大高さ。子（内側 Tabs 等）はこの下で高さを受け取り、内側でスクロール
 * - guest: 親の flex チェーンの中でタブ見出し固定＋アクティブパネルのみ縦スクロール
 */
export type TabBodyScrollMode = 'none' | 'host' | 'guest'

interface TabsProps {
  tabs: TabItem[]
  defaultTab?: string
  /** 指定時は制御モード（和解対象債権と入金予定履歴のタブ同期など） */
  activeTabId?: string
  onActiveTabChange?: (id: string) => void
  /** 2分割（中央で区切り、テキスト中央寄せ）などの見た目調整 */
  variant?: 'default' | 'split'
  /** 下段（債権者）タブなど、密度を上げて高さを詰める */
  density?: 'normal' | 'dense'
  tabBodyScroll?: TabBodyScrollMode
  /** tabBodyScroll が host のときのルート高さ（Tailwind。例: h-[min(72vh,34rem)]）。未指定時は約20行相当 */
  tabBodyMaxHeightClassName?: string
}

export function Tabs({
  tabs,
  defaultTab,
  activeTabId: controlledActiveId,
  onActiveTabChange,
  variant = 'default',
  density = 'normal',
  tabBodyScroll = 'none',
  /** max-h だけだと flex 内で子の flex-1 が効かずスクロールできないことがあるため h-[min(...)] で高さを確定 */
  tabBodyMaxHeightClassName = 'h-[min(72vh,34rem)]',
}: TabsProps) {
  const [internalTab, setInternalTab] = useState(defaultTab ?? tabs[0]?.id)
  const controlled =
    controlledActiveId !== undefined && onActiveTabChange !== undefined
  const activeTab = controlled ? controlledActiveId : internalTab
  const setActiveTab = controlled ? onActiveTabChange : setInternalTab

  const activeContent = tabs.find((t) => t.id === activeTab)?.content

  const isSplit = variant === 'split'
  const isDense = density === 'dense'

  const tabRowClass =
    isSplit
      ? 'grid w-full shrink-0 grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white'
      : 'flex shrink-0 flex-wrap gap-1 overflow-x-auto border-b border-slate-200 pb-px'

  const panelClass =
    tabBodyScroll === 'none'
      ? 'mt-4'
      : tabBodyScroll === 'host'
        ? 'mt-4 flex min-h-0 flex-1 flex-col overflow-hidden'
        : 'mt-4 min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]'

  const rootClass =
    tabBodyScroll === 'none'
      ? ''
      : tabBodyScroll === 'host'
        ? `flex min-h-0 flex-col overflow-hidden ${tabBodyMaxHeightClassName}`
        : 'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden'

  return (
    <div className={rootClass || undefined}>
      <div className={tabRowClass}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          const accent = tab.accent
          const base = isSplit
            ? `w-full px-4 ${isDense ? 'py-1.5 text-xs' : 'py-2 text-sm'} font-semibold transition-colors text-center`
            : accent
              ? `rounded-t-md border-l-4 border-b-2 ${isDense ? 'py-1.5 pl-2 pr-2 text-xs' : 'py-2.5 pl-3 pr-3 text-sm'} font-medium whitespace-nowrap transition-colors`
              : `rounded-t-md border-b-2 ${isDense ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} font-medium whitespace-nowrap transition-colors`

          const state = isSplit
            ? active
              ? 'bg-slate-100 text-slate-900'
              : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            : active
              ? accent?.active ?? 'border-blue-500 text-blue-600'
              : accent?.inactive ??
                'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'

          const splitDivider =
            isSplit && tab.id !== tabs[tabs.length - 1]?.id
              ? 'border-r border-slate-200'
              : ''
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`${base} ${state} ${splitDivider}`}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span
                  className={`ml-2 rounded-full ${isDense ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-xs'} ${
                    active
                      ? accent?.badgeActive ?? 'bg-blue-100 text-blue-600'
                      : accent?.badgeInactive ?? 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className={panelClass}>
        {tabBodyScroll === 'none' ? (
          activeContent
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {activeContent}
          </div>
        )}
      </div>
    </div>
  )
}
