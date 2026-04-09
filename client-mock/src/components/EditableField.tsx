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
  /** ラベルと値を1行に詰め、余白・字サイズを下げる（詳細ヘッダー等） */
  compact?: boolean
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
  compact = false,
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

  const inputBase = compact
    ? 'flex-1 min-w-0 text-xs border border-blue-300 rounded px-1.5 py-0.5 h-7 leading-tight focus:outline-none focus:ring-1 focus:ring-blue-500'
    : 'flex-1 text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500'

  if (disabled) {
    if (compact) {
      return (
        <div className="flex items-center gap-2 min-h-[1.5rem] py-0">
          <span className="w-[8.75rem] shrink-0 text-[10px] font-medium text-slate-500 leading-none truncate">
            {label}
          </span>
          <div className="min-w-0 flex-1 text-xs text-slate-700 truncate leading-tight">
            {formattedDisplay}
            {suffix && <span className="text-slate-400 ml-0.5">{suffix}</span>}
          </div>
        </div>
      )
    }
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
    if (compact) {
      return (
        <div className="flex items-center gap-2 min-h-[1.5rem] py-0">
          <span className="w-[8.75rem] shrink-0 text-[10px] font-medium text-slate-500 leading-none truncate">
            {label}
          </span>
          <div
            className="group flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded px-1 py-0.5 -mx-1 text-xs leading-tight text-slate-700 hover:bg-blue-50/80"
            title={String(formattedDisplay)}
            onClick={() => {
              setEditValue(String(value ?? ''))
              setIsEditing(true)
            }}
          >
            <span className="min-w-0 flex-1 truncate">
              {formattedDisplay}
              {suffix && <span className="text-slate-400 ml-0.5">{suffix}</span>}
            </span>
            <span className="shrink-0 text-[10px] text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
              編集
            </span>
          </div>
        </div>
      )
    }
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

  if (compact) {
    return (
      <div className="flex items-center gap-2 min-h-[1.75rem] py-0">
        <span className="w-[8.75rem] shrink-0 text-[10px] font-medium text-slate-500 leading-none truncate">
          {label}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {type === 'select' && options ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className={inputBase}
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
              rows={2}
              className={`${inputBase} min-h-[2.5rem]`}
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
              className={inputBase}
            />
          )}
          {suffix && <span className="text-slate-400 text-xs shrink-0">{suffix}</span>}
          {type === 'textarea' && (
            <div className="flex shrink-0 gap-0.5">
              <button
                type="button"
                onClick={handleSave}
                className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-1.5 py-0.5 text-[10px] bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
              >
                取消
              </button>
            </div>
          )}
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
