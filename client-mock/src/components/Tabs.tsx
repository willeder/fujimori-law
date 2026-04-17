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
  /** tabBodyScroll が none のとき、パネル上の余白（カード内埋め込み等） */
  panelTopSpacing?: 'normal' | 'tight'
  tabBodyScroll?: TabBodyScrollMode
  /** tabBodyScroll が host のときのルート高さ（Tailwind。例: h-[min(72vh,34rem)]）。未指定時は約20行相当 */
  tabBodyMaxHeightClassName?: string
  /**
   * タブ行の直下・アクティブパネルの上に表示（入金スケジュールのサマリ帯など）。
   * tabBodyScroll が guest / host のときのみ有効。
   */
  beforeActivePanelContent?: ReactNode
}

export function Tabs({
  tabs,
  defaultTab,
  activeTabId: controlledActiveId,
  onActiveTabChange,
  variant = 'default',
  density = 'normal',
  panelTopSpacing = 'normal',
  tabBodyScroll = 'none',
  /** max-h だけだと flex 内で子の flex-1 が効かずスクロールできないことがあるため h-[min(...)] で高さを確定 */
  tabBodyMaxHeightClassName = 'h-[min(72vh,34rem)]',
  beforeActivePanelContent,
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
      ? 'grid w-full shrink-0 grid-cols-2 overflow-hidden rounded-md border border-slate-100 bg-slate-50/40'
      : 'flex shrink-0 flex-nowrap gap-0.5 overflow-x-auto border-b border-slate-100 bg-slate-50/30 pb-px'

  const panelTop = tabBodyScroll === 'none' ? (panelTopSpacing === 'tight' ? 'mt-1.5' : 'mt-2.5') : ''

  const panelClass =
    tabBodyScroll === 'none'
      ? panelTop
      : tabBodyScroll === 'host'
        ? 'mt-2 flex min-h-0 flex-1 flex-col overflow-hidden'
        : 'mt-2 min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]'

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
            ? `w-full px-2 ${isDense ? 'py-0.5 text-[10px] leading-none' : 'py-1 text-xs leading-tight'} font-medium transition-colors text-center`
            : accent
              ? `rounded-t-md border-l-2 ${isDense ? 'inline-flex h-7 shrink-0 items-center py-0 pl-1.5 pr-1.5 text-[10px] leading-none' : 'py-1 pl-2 pr-2 text-xs leading-tight'} font-normal whitespace-nowrap transition-colors`
              : `rounded-t-md border-b-2 border-b-transparent ${isDense ? 'inline-flex h-7 shrink-0 items-center px-2 py-0 text-[10px] leading-none' : 'px-2 py-1 text-xs leading-tight'} font-normal whitespace-nowrap transition-colors`

          const state = isSplit
            ? active
              ? 'bg-white font-medium text-slate-900 shadow-[inset_0_-1px_0_0_theme(colors.slate.300)]'
              : 'bg-transparent text-slate-500 hover:bg-slate-100/50 hover:text-slate-800'
            : active
              ? accent?.active ?? 'border-b-2 border-b-slate-700 font-medium text-slate-900'
              : accent?.inactive ??
                'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100/40 hover:text-slate-700'

          const splitDivider =
            isSplit && tab.id !== tabs[tabs.length - 1]?.id
              ? 'border-r border-slate-100'
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
                  className={`ml-1 rounded-full ${isDense ? 'px-0.5 py-px text-[8px] leading-none' : 'px-1 py-0.5 text-[9px] leading-none'} ${
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
          <>
            {beforeActivePanelContent != null ? (
              <div className="min-h-[1.75rem] min-w-0 shrink-0 overflow-x-auto border-b border-slate-100 bg-slate-50/40 px-1 py-0.5">
                {beforeActivePanelContent}
              </div>
            ) : null}
            {activeContent}
          </>
        ) : (
          <div
            className={
              tabBodyScroll === 'guest'
                ? 'flex min-h-0 min-w-0 flex-1 flex-col'
                : 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
            }
          >
            {beforeActivePanelContent != null ? (
              <>
                <div className="min-h-[1.75rem] min-w-0 shrink-0 overflow-x-auto border-b border-slate-100 bg-slate-50/40 px-1 py-0.5">
                  {beforeActivePanelContent}
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
                  {activeContent}
                </div>
              </>
            ) : (
              activeContent
            )}
          </div>
        )}
      </div>
    </div>
  )
}
