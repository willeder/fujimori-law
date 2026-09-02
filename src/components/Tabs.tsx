import { useState, type ReactNode } from 'react'
import type { CreditorTabAccent } from '../lib/creditorTabAccent'

export interface TabItem {
  id: string
  label: string
  badge?: number | string
  content: ReactNode
  /** 左ストライプ・背景でタブを識別（和解対象債権など） */
  accent?: CreditorTabAccent
  /** true のとき並べ替え対象外（ドラッグ不可・位置固定。例: 「すべて合算」） */
  fixed?: boolean
  /** true のときグレーアウト表示（受任対象外の債権者タブなど）。accent より優先 */
  muted?: boolean
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
   * host のとき本文を固定の余白まで伸ばさず、内容の高さに合わせる（max は tabBodyMaxHeightClassName 側で指定）。
   */
  hostBodyNaturalHeight?: boolean
  /**
   * タブ行の直下・アクティブパネルの上に表示（入金スケジュールのサマリ帯など）。
   * tabBodyScroll が guest / host のときのみ有効。
   */
  beforeActivePanelContent?: ReactNode
  /**
   * 本文（パネル）でスクロールさせるかどうか。
   *   'auto'   … 本文が長ければここでスクロールする（既定。和解状況の各社タブなど）
   *   'hidden' … ここではスクロールさせない。中身が自分でスクロールする場合に使う
   *              （入金スケジュールの表など）。指定しないと、表の中と外の二重
   *              スクロールになり、合計やボタンまで一緒に流れて操作しづらくなる。
   */
  activePanelOverflow?: 'auto' | 'hidden'
  /**
   * guest のとき、ルート・パネルを親の余白まで flex 伸長するか。
   * false のときは内容の高さに寄せ、長い内容はルートでスクロール（和解状況の個別債権者タブ向け）。
   */
  guestExpandToParent?: boolean | ((activeTabId: string) => boolean)
  /** true のとき fixed でないタブをドラッグで並べ替え可能にする */
  reorderable?: boolean
  /**
   * 並べ替え確定時に呼ばれる。引数は fixed を除いたタブ id の新しい並び順。
   * 実際の並び順（グループ制約・永続化）は呼び出し側で決定する。
   */
  onReorder?: (orderedIds: string[]) => void
}

export function Tabs({
  tabs,
  defaultTab,
  activeTabId: controlledActiveId,
  onActiveTabChange,
  variant = 'default',
  density = 'dense',
  panelTopSpacing = 'normal',
  tabBodyScroll = 'none',
  /** max-h だけだと flex 内で子の flex-1 が効かずスクロールできないことがあるため h-[min(...)] で高さを確定 */
  tabBodyMaxHeightClassName = 'h-[min(72vh,34rem)]',
  beforeActivePanelContent,
  activePanelOverflow = 'auto',
  guestExpandToParent = true,
  hostBodyNaturalHeight = false,
  reorderable = false,
  onReorder,
}: TabsProps) {
  const [internalTab, setInternalTab] = useState(defaultTab ?? tabs[0]?.id)
  // ドラッグ並べ替え（HTML5 DnD）。dragId=つかんでいるタブ, overId=ドロップ先候補
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const canReorder = reorderable && onReorder != null

  const commitReorder = (targetId: string) => {
    if (!canReorder || dragId == null || targetId === dragId) return
    const nonFixed = tabs.filter((t) => !t.fixed).map((t) => t.id)
    const from = nonFixed.indexOf(dragId)
    const to = nonFixed.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = [...nonFixed]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onReorder?.(next)
  }
  const controlled =
    controlledActiveId !== undefined && onActiveTabChange !== undefined
  const activeTab = controlled ? controlledActiveId : internalTab
  const setActiveTab = controlled ? onActiveTabChange : setInternalTab

  const activeContent = tabs.find((t) => t.id === activeTab)?.content

  const guestExpand =
    typeof guestExpandToParent === 'function'
      ? guestExpandToParent(activeTab)
      : guestExpandToParent

  const isSplit = variant === 'split'
  const isDense = density === 'dense'

  const tabRowClass =
    isSplit
      ? 'grid w-full shrink-0 grid-cols-2 overflow-hidden rounded-md border border-slate-300 bg-slate-100'
      : 'flex shrink-0 flex-nowrap gap-0.5 overflow-x-auto border-b border-slate-100 bg-slate-50/30 pb-px'

  const panelTop = tabBodyScroll === 'none' ? (panelTopSpacing === 'tight' ? 'mt-1.5' : 'mt-2.5') : ''

  const panelClass =
    tabBodyScroll === 'none'
      ? panelTop
      : tabBodyScroll === 'host'
        ? hostBodyNaturalHeight
          ? 'mt-2 flex min-h-0 shrink-0 flex-col overflow-x-hidden'
          : 'mt-2 flex min-h-0 flex-1 flex-col overflow-hidden'
        : activePanelOverflow === 'hidden'
          ? // 中身（表など）が自分でスクロールするので、ここでは動かさない
            'mt-2 flex min-h-0 flex-1 flex-col overflow-hidden'
          : tabBodyScroll === 'guest' && !guestExpand
            ? 'mt-2 min-h-0 max-h-full shrink-0 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]'
            : 'mt-2 min-h-0 flex-1 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]'

  const rootClass =
    tabBodyScroll === 'none'
      ? ''
      : tabBodyScroll === 'host'
        ? hostBodyNaturalHeight
          ? `flex min-h-0 w-full min-w-0 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] ${tabBodyMaxHeightClassName}`
          : `flex min-h-0 flex-col overflow-hidden ${tabBodyMaxHeightClassName}`
        : tabBodyScroll === 'guest' && !guestExpand
          ? 'flex min-h-0 w-full min-w-0 max-h-full flex-col overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]'
          : 'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden'

  return (
    <div className={rootClass || undefined}>
      <div className={tabRowClass}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          const accent = tab.accent
          const base = isSplit
            ? // split（入金スケジュール/和解状況・債権者接触/依頼者接触の大タブ）:
              // 視認性・押しやすさのため約1.5倍の高さに（No.155。中の各社タブ等は対象外）
              `w-full px-2 ${isDense ? 'py-2 text-[0.6875rem] leading-none' : 'py-1.5 text-[0.6875rem] leading-tight'} font-medium transition-colors text-center`
            : accent
              ? `rounded-t-md border-l-2 ${isDense ? 'inline-flex h-7 shrink-0 items-center py-0 pl-1.5 pr-1.5 text-[0.625rem] leading-none' : 'py-1 pl-2 pr-2 text-xs leading-tight'} font-normal whitespace-nowrap transition-colors`
              : `rounded-t-md border-b-2 border-b-transparent ${isDense ? 'inline-flex h-7 shrink-0 items-center px-2 py-0 text-[0.625rem] leading-none' : 'px-2 py-1 text-xs leading-tight'} font-normal whitespace-nowrap transition-colors`

          const muted = tab.muted
          const state = isSplit
            ? active
              ? 'bg-white font-semibold text-slate-900 shadow-sm'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            : muted
              ? active
                ? 'border-l-slate-500 border-b-slate-500 bg-slate-200 font-medium text-slate-600 shadow-sm'
                : 'border-l-slate-300 border-b-transparent bg-slate-100 text-slate-400 hover:bg-slate-200/70 hover:text-slate-600'
              : active
                ? accent?.active ?? 'border-b-2 border-b-slate-700 font-medium text-slate-900'
                : accent?.inactive ??
                  'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100/40 hover:text-slate-700'

          const splitDivider =
            isSplit && tab.id !== tabs[tabs.length - 1]?.id
              ? 'border-r border-slate-100'
              : ''
          const draggable = canReorder && !tab.fixed
          const isDragging = draggable && dragId === tab.id
          const isOver =
            draggable && overId === tab.id && dragId != null && dragId !== tab.id
          const dndClass = draggable
            ? `cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''} ${isOver ? 'ring-2 ring-blue-400' : ''}`
            : ''
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              draggable={draggable || undefined}
              onDragStart={
                draggable
                  ? (e) => {
                      setDragId(tab.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }
                  : undefined
              }
              onDragOver={
                draggable
                  ? (e) => {
                      e.preventDefault()
                      if (overId !== tab.id) setOverId(tab.id)
                    }
                  : undefined
              }
              onDrop={
                draggable
                  ? (e) => {
                      e.preventDefault()
                      commitReorder(tab.id)
                      setDragId(null)
                      setOverId(null)
                    }
                  : undefined
              }
              onDragEnd={
                canReorder
                  ? () => {
                      setDragId(null)
                      setOverId(null)
                    }
                  : undefined
              }
              className={`${base} ${state} ${splitDivider} ${dndClass}`}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span
                  className={`ml-1 rounded-full ${isDense ? 'px-0.5 py-px text-[0.5rem] leading-none' : 'px-1 py-0.5 text-[0.5625rem] leading-none'} ${
                    muted
                      ? 'bg-slate-200 text-slate-500'
                      : active
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
                ? guestExpand
                  ? 'flex min-h-0 min-w-0 flex-1 flex-col'
                  : 'flex min-h-0 min-w-0 flex-col'
                : tabBodyScroll === 'host' && hostBodyNaturalHeight
                  ? 'flex min-h-0 min-w-0 flex-col'
                  : 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
            }
          >
            {beforeActivePanelContent != null ? (
              <>
                <div className="min-h-[1.75rem] min-w-0 shrink-0 overflow-x-auto border-b border-slate-100 bg-slate-50/40 px-1 py-0.5">
                  {beforeActivePanelContent}
                </div>
                <div
                  className={`flex min-h-0 min-w-0 flex-1 flex-col ${
                    activePanelOverflow === 'hidden' ? 'overflow-hidden' : 'overflow-auto'
                  }`}
                >
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
