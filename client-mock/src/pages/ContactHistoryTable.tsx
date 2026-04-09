import { useMemo, useState } from 'react'
import { DataTable, type Column } from '../components'
import { useCaseDispatch, useCaseState } from '../store/useCaseStore'
import type { ContactHistory } from '../types'

interface ContactHistoryTableProps {
  caseId: number
  histories: ContactHistory[]
}

const toolOptions = ['LINE', '電話', 'メール', 'SMS', 'その他'] as const

export function ContactHistoryTable({ caseId, histories }: ContactHistoryTableProps) {
  const dispatch = useCaseDispatch()
  const { contactHistories } = useCaseState()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<Partial<ContactHistory>>({})

  const sorted = useMemo(() => {
    const toKey = (h: ContactHistory) => `${h.contactDate ?? ''} ${h.contactTime ?? ''}`
    return [...histories].sort((a, b) => toKey(b).localeCompare(toKey(a)))
  }, [histories])

  const handleEdit = (h: ContactHistory) => {
    setEditingId(h.id)
    setEditData({
      contactDate: h.contactDate,
      contactTime: h.contactTime,
      staff: h.staff,
      tool: h.tool,
      comment: h.comment,
    })
  }

  const handleSave = (h: ContactHistory) => {
    dispatch({
      type: 'UPDATE_CONTACT_HISTORY',
      payload: {
        ...h,
        contactDate: editData.contactDate ?? null,
        contactTime: editData.contactTime ?? null,
        staff: editData.staff ?? null,
        tool: editData.tool ?? null,
        comment: editData.comment ?? null,
      },
    })
    setEditingId(null)
    setEditData({})
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditData({})
  }

  const handleDelete = (h: ContactHistory) => {
    dispatch({ type: 'DELETE_CONTACT_HISTORY', payload: h.id })
  }

  const columns: Column<ContactHistory>[] = [
    {
      key: 'contactDate',
      header: '接触日',
      width: '110px',
      render: (h) =>
        editingId === h.id ? (
          <input
            type="date"
            value={editData.contactDate ?? ''}
            onChange={(e) =>
              setEditData({ ...editData, contactDate: e.target.value || null })
            }
            className="w-full rounded border border-blue-300 px-1 py-0.5 text-xs"
          />
        ) : (
          <span className={!h.contactDate ? 'text-slate-300' : ''}>
            {h.contactDate ?? '-'}
          </span>
        ),
    },
    {
      key: 'contactTime',
      header: '時刻',
      width: '70px',
      align: 'center',
      render: (h) =>
        editingId === h.id ? (
          <input
            type="time"
            value={editData.contactTime ?? ''}
            onChange={(e) =>
              setEditData({ ...editData, contactTime: e.target.value || null })
            }
            className="w-full rounded border border-blue-300 px-1 py-0.5 text-xs"
          />
        ) : (
          <span className={!h.contactTime ? 'text-slate-300' : ''}>
            {h.contactTime ?? '-'}
          </span>
        ),
    },
    {
      key: 'staff',
      header: '担当',
      width: '90px',
      render: (h) =>
        editingId === h.id ? (
          <input
            value={editData.staff ?? ''}
            onChange={(e) => setEditData({ ...editData, staff: e.target.value })}
            className="w-full rounded border border-blue-300 px-1 py-0.5 text-xs"
            placeholder="担当"
          />
        ) : (
          <span className={!h.staff ? 'text-slate-300' : ''}>{h.staff ?? '-'}</span>
        ),
    },
    {
      key: 'tool',
      header: 'ツール',
      width: '90px',
      render: (h) =>
        editingId === h.id ? (
          <select
            value={editData.tool ?? ''}
            onChange={(e) => setEditData({ ...editData, tool: e.target.value || null })}
            className="w-full rounded border border-blue-300 px-1 py-0.5 text-xs"
          >
            <option value="">-</option>
            {toolOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : (
          <span className={!h.tool ? 'text-slate-300' : ''}>{h.tool ?? '-'}</span>
        ),
    },
    {
      key: 'comment',
      header: 'コメント',
      render: (h) =>
        editingId === h.id ? (
          <textarea
            value={editData.comment ?? ''}
            onChange={(e) => setEditData({ ...editData, comment: e.target.value })}
            className="w-full min-h-10 rounded border border-blue-300 px-1 py-0.5 text-xs"
            placeholder="コメント"
            rows={2}
          />
        ) : (
          <div
            className={`whitespace-normal break-words leading-relaxed ${!h.comment ? 'text-slate-300' : ''}`}
          >
            {h.comment ?? '-'}
          </div>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: '130px',
      render: (h) => {
        if (editingId === h.id) {
          return (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => handleSave(h)}
                className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-300"
              >
                取消
              </button>
            </div>
          )
        }
        return (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => handleEdit(h)}
              className="rounded px-2 py-1 text-xs text-blue-500 hover:bg-blue-50 hover:text-blue-600"
            >
              編集
            </button>
            <button
              type="button"
              onClick={() => handleDelete(h)}
              className="rounded px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-600"
            >
              削除
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-3">
      <DataTable
        data={sorted}
        columns={columns}
        keyField="id"
        emptyMessage="接触履歴がありません"
      />

      <button
        type="button"
        onClick={() => {
          const newId = Math.max(0, ...contactHistories.map((h) => h.id)) + 1
          dispatch({
            type: 'ADD_CONTACT_HISTORY',
            payload: {
              id: newId,
              caseId,
              contactDate: null,
              contactTime: null,
              staff: null,
              tool: null,
              targetType: '依頼者',
              comment: null,
            },
          })
          setEditingId(newId)
          setEditData({
            contactDate: null,
            contactTime: null,
            staff: null,
            tool: null,
            comment: null,
          })
        }}
        className="w-full rounded border border-dashed border-blue-300 py-2 text-sm text-blue-500 transition-colors hover:bg-blue-50"
      >
        + 接触履歴を追加
      </button>
    </div>
  )
}

