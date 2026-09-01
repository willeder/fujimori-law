import { useState, type ReactNode } from 'react'

interface SectionCardProps {
  title: string
  children: ReactNode
  color?: 'blue' | 'green' | 'amber' | 'slate'
  collapsible?: boolean
  defaultOpen?: boolean
}

/** カテゴリ用のごく薄い左ライン（本文フィールドを主役に） */
const colorMap = {
  blue: 'border-l-blue-300/70',
  green: 'border-l-green-400/60',
  amber: 'border-l-amber-400/70',
  slate: 'border-l-slate-300/80',
}

export function SectionCard({
  title,
  children,
  color = 'slate',
  collapsible = false,
  defaultOpen = true,
}: SectionCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div
      className={`overflow-hidden rounded-lg border border-slate-100 bg-white shadow-none border-l-2 ${colorMap[color]}`}
    >
      <div
        className={`flex items-center justify-between px-2 py-1 ${collapsible ? 'cursor-pointer' : ''}`}
        onClick={() => collapsible && setIsOpen(!isOpen)}
      >
        <h3
          className="inline-block rounded px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide text-white"
          style={{ backgroundColor: '#689BC6' }}
        >
          {title}
        </h3>
        {collapsible && (
          <button type="button" className="text-slate-400 hover:text-slate-600" aria-label={isOpen ? '折りたたむ' : '展開する'}>
            {isOpen ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        )}
      </div>
      {isOpen && <div className="min-h-0 min-w-0 px-2 py-2 sm:px-3">{children}</div>}
    </div>
  )
}
