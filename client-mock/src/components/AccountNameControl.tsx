import { useState } from 'react'
import { useUserSettings } from '../context/UserSettingsContext'

export function AccountNameControl() {
  const { accountName, setAccountName } = useUserSettings()
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(accountName)

  const handleSave = () => {
    setAccountName(editValue.trim())
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(accountName)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-xs text-slate-500">担当:</span>
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder="名前を入力"
          className="w-20 rounded border border-blue-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setEditValue(accountName)
        setIsEditing(true)
      }}
      className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
      title="接触履歴の担当者名として自動入力されます"
    >
      <span className="text-slate-500">担当:</span>
      <span className={accountName ? 'font-medium text-slate-800' : 'text-slate-400'}>
        {accountName || '未設定'}
      </span>
    </button>
  )
}
