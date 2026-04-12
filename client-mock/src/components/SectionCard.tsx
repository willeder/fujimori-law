import { useState, type ReactNode } from 'react'

interface SectionCardProps {
  title: string
  children: ReactNode
  color?: 'blue' | 'green' | 'amber' | 'slate'
  collapsible?: boolean
  defaultOpen?: boolean
}

const colorMap = {
  blue: 'border-l-blue-500',
  green: 'border-l-green-500',
  amber: 'border-l-amber-500',
  slate: 'border-l-slate-400',
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
      className={`bg-white rounded-lg shadow-sm border border-slate-200 border-l-4 ${colorMap[color]}`}
    >
      <div
        className={`px-4 py-3 border-b border-slate-100 flex items-center justify-between ${collapsible ? 'cursor-pointer hover:bg-slate-50' : ''}`}
        onClick={() => collapsible && setIsOpen(!isOpen)}
      >
        <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
        {collapsible && (
          <button className="text-slate-400 hover:text-slate-600">
            {isOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        )}
      </div>
      {isOpen && <div className="min-h-0 p-4">{children}</div>}
    </div>
  )
}
