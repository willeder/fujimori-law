import { useMemo, useState } from 'react'
import { DataTable, type Column } from '../components'
import { useUserSettings } from '../context/UserSettingsContext'
import { useCaseDispatch, useCaseState } from '../store/useCaseStore'
import type { ContactHistory } from '../types'

interface ContactHistoryTableProps {
  caseId: number
  histories: ContactHistory[]
  /** この表の対象（追加行の targetType に使用） */
  targetType: '依頼者' | '債権者'
}

const toolOptions = ['LINE', '電話', 'メール', 'SMS', 'その他'] as const

export function ContactHistoryTable({
  caseId,
  histories,
  targetType,
}: ContactHistoryTableProps) {
  const dispatch = useCaseDispatch()
  const { contactHistories } = useCaseState()
  const { accountName } = useUserSettings()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<Partial<ContactHistory>>({})

  const getLocalNow = () => {
    const now = new Date()
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const y = now.getFullYear()
    const m = pad2(now.getMonth() + 1)
    const d = pad2(now.getDate())
    const hh = pad2(now.getHours())
    const mm = pad2(now.getMinutes())
    return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` }
  }

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
      creditorName: h.creditorName ?? null,
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
        creditorName: targetType === '債権者' ? (editData.creditorName ?? null) : null,
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

  const cellIn = 'w-full rounded border border-blue-300 px-1 py-0.5 text-[9px] leading-tight'

  const creditorColumn: Column<ContactHistory>[] =
    targetType === '債権者'
      ? [
          {
            key: 'creditorName',
            header: '債権者',
            width: '120px',
            render: (h) =>
              editingId === h.id ? (
                <input
                  value={editData.creditorName ?? ''}
                  onChange={(e) =>
                    setEditData({ ...editData, creditorName: e.target.value || null })
                  }
                  className={cellIn}
                  placeholder="債権者名"
                />
              ) : (
                <span className={!h.creditorName ? 'text-slate-300' : ''}>
                  {h.creditorName ?? '-'}
                </span>
              ),
          },
        ]
      : []

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
            className={cellIn}
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
            className={cellIn}
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
            className={cellIn}
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
            className={cellIn}
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
    ...creditorColumn,
    {
      key: 'comment',
      header: 'コメント',
      width: undefined,
      render: (h) =>
        editingId === h.id ? (
          <textarea
            value={editData.comment ?? ''}
            onChange={(e) => setEditData({ ...editData, comment: e.target.value })}
            className="w-full min-h-8 rounded border border-blue-300 px-1 py-0.5 text-[9px] leading-tight"
            placeholder="コメント"
            rows={2}
          />
        ) : (
          <div
            className={`whitespace-normal break-words leading-snug ${!h.comment ? 'text-slate-300' : ''}`}
          >
            {h.comment ?? '-'}
          </div>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: '130px',
      sortable: false,
      render: (h) => {
        if (editingId === h.id) {
          return (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => handleSave(h)}
                className="rounded bg-blue-500 px-1.5 py-0.5 text-[9px] text-white hover:bg-blue-600"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] text-slate-700 hover:bg-slate-300"
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
              className="rounded px-1.5 py-0.5 text-[9px] text-blue-500 hover:bg-blue-50 hover:text-blue-600"
            >
              編集
            </button>
            <button
              type="button"
              onClick={() => handleDelete(h)}
              className="rounded px-1.5 py-0.5 text-[9px] text-rose-500 hover:bg-rose-50 hover:text-rose-600"
            >
              削除
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
      <div className="min-w-0 overflow-x-auto">
        <div className="min-w-0 rounded-md border border-slate-100/80 bg-slate-50/60 px-2 py-1">
          <DataTable
            data={sorted}
            columns={columns}
            keyField="id"
            emptyMessage="接触履歴がありません"
            density="dense"
            stickyHeader
            slimHeader
            bodyMaxHeightClassName="max-h-[min(55vh,32rem)]"
          />
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <div className="flex w-max min-w-0 flex-nowrap items-center whitespace-nowrap text-xs leading-none text-slate-800">
          <button
            type="button"
            onClick={() => {
              const { date: currentDate, time: currentTime } = getLocalNow()
              const staffName = accountName || null

              const newId = Math.max(0, ...contactHistories.map((h) => h.id)) + 1
              dispatch({
                type: 'ADD_CONTACT_HISTORY',
                payload: {
                  id: newId,
                  caseId,
                  contactDate: currentDate,
                  contactTime: currentTime,
                  staff: staffName,
                  tool: null,
                  targetType,
                  ...(targetType === '債権者'
                    ? { creditorName: null as string | null }
                    : {}),
                  comment: null,
                },
              })
              setEditingId(newId)
              setEditData({
                contactDate: currentDate,
                contactTime: currentTime,
                staff: staffName,
                tool: null,
                creditorName: null,
                comment: null,
              })
            }}
            className="min-h-[1.75rem] rounded-md border border-slate-100/80 bg-slate-50/60 px-2 py-0.5 text-xs leading-none text-blue-600 transition-colors hover:bg-blue-50"
          >
            + 接触履歴を追加
          </button>
        </div>
      </div>
    </div>
  )
}
