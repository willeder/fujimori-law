/**
 * 検索モード起動（FileMaker風）。Ctrl+F / Ctrl+Shift+F（⌘でも可）またはボタンで
 * モーダルを開き、入力した複数フィールドのAND条件で案件一覧（/）に絞り込み結果を表示する。
 * AppHeader（一覧系ページ）と案件詳細ヘッダーの両方に置き、全画面から起動できる。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FindModeModal } from './FindModeModal'

export function FindModeLauncher() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+F / Cmd+F に加え、Ctrl+Shift+F / Cmd+Shift+F でも起動する
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="検索モード（Ctrl+F / Ctrl+Shift+F）"
        className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
      >
        🔍 検索
      </button>
      <FindModeModal
        open={open}
        onClose={() => setOpen(false)}
        onSearch={(conditions) => {
          setOpen(false)
          navigate('/', { state: { conditions } })
        }}
      />
    </>
  )
}
