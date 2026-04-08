import { useState, useEffect, useRef } from 'react'

interface EditableFieldProps {
  label: string
  value: string | number | null | undefined
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea'
  options?: { value: string; label: string }[]
  suffix?: string
  placeholder?: string
  disabled?: boolean
}

export function EditableField({
  label,
  value,
  onChange,
  type = 'text',
  options,
  suffix,
  placeholder,
  disabled = false,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(value ?? ''))
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  const handleSave = () => {
    onChange(editValue)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(String(value ?? ''))
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const displayValue = value ?? '-'
  const formattedDisplay =
    type === 'number' && typeof value === 'number'
      ? value.toLocaleString()
      : displayValue

  if (disabled) {
    return (
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-500">{label}</label>
        <div className="text-sm text-slate-700">
          {formattedDisplay}
          {suffix && <span className="text-slate-400 ml-1">{suffix}</span>}
        </div>
      </div>
    )
  }

  if (!isEditing) {
    return (
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-500">{label}</label>
        <div
          className="text-sm text-slate-700 cursor-pointer hover:bg-blue-50 px-2 py-1 -mx-2 rounded transition-colors group"
          onClick={() => {
            setEditValue(String(value ?? ''))
            setIsEditing(true)
          }}
        >
          {formattedDisplay}
          {suffix && <span className="text-slate-400 ml-1">{suffix}</span>}
          <span className="text-blue-400 opacity-0 group-hover:opacity-100 ml-2 text-xs">
            編集
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-500">{label}</label>
      <div className="flex items-center gap-2">
        {type === 'select' && options ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">選択してください</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={3}
            className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        {suffix && <span className="text-slate-400 text-sm">{suffix}</span>}
        {type === 'textarea' && (
          <div className="flex gap-1">
            <button
              onClick={handleSave}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              保存
            </button>
            <button
              onClick={handleCancel}
              className="px-2 py-1 text-xs bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
            >
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
