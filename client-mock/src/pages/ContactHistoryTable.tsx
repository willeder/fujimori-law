import { useMemo, useState } from 'react'
import { DataTable, type Column } from '../components'
import { useCaseDispatch, useCaseState } from '../store/useCaseStore'
import type { ContactHistory } from '../types'

interface ContactHistoryTableProps {
  caseId: number
  histories: ContactHistory[]
  /** この表の対象（追加行の targetType に使用） */
  targetType: '依頼者' | '債権者'
  /**
   * 受任資料カード内など狭い領域向け：小フォント・行は1行（折返しなし）・表は横スクロール＋縦スクロール
   */
  embedded?: boolean
}

const toolOptions = ['LINE', '電話', 'メール', 'SMS', 'その他'] as const

export function ContactHistoryTable({
  caseId,
  histories,
  targetType,
  embedded = false,
}: ContactHistoryTableProps) {
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

  const cellIn = embedded
    ? 'w-full rounded border border-blue-300 px-0.5 py-0 text-[10px] leading-tight'
    : 'w-full rounded border border-blue-300 px-1 py-0.5 text-xs'

  const creditorColumn: Column<ContactHistory>[] =
    targetType === '債権者'
      ? [
          {
            key: 'creditorName',
            header: '債権者',
            width: embedded ? '76px' : '120px',
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
              ) : embedded ? (
                <span
                  className={`inline-block max-w-[4.5rem] truncate align-middle ${!h.creditorName ? 'text-slate-300' : ''}`}
                  title={h.creditorName ?? undefined}
                >
                  {h.creditorName ?? '-'}
                </span>
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
      width: embedded ? '86px' : '110px',
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
      width: embedded ? '58px' : '70px',
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
      width: embedded ? '64px' : '90px',
      render: (h) =>
        editingId === h.id ? (
          <input
            value={editData.staff ?? ''}
            onChange={(e) => setEditData({ ...editData, staff: e.target.value })}
            className={cellIn}
            placeholder="担当"
          />
        ) : embedded ? (
          <span
            className={`inline-block max-w-[3.5rem] truncate align-middle ${!h.staff ? 'text-slate-300' : ''}`}
            title={h.staff ?? undefined}
          >
            {h.staff ?? '-'}
          </span>
        ) : (
          <span className={!h.staff ? 'text-slate-300' : ''}>{h.staff ?? '-'}</span>
        ),
    },
    {
      key: 'tool',
      header: 'ツール',
      width: embedded ? '56px' : '90px',
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
      width: embedded ? '11rem' : undefined,
      render: (h) =>
        editingId === h.id ? (
          embedded ? (
            <input
              type="text"
              value={editData.comment ?? ''}
              onChange={(e) => setEditData({ ...editData, comment: e.target.value })}
              className={`${cellIn} min-w-[6rem]`}
              placeholder="コメント"
            />
          ) : (
            <textarea
              value={editData.comment ?? ''}
              onChange={(e) => setEditData({ ...editData, comment: e.target.value })}
              className="w-full min-h-10 rounded border border-blue-300 px-1 py-0.5 text-xs"
              placeholder="コメント"
              rows={2}
            />
          )
        ) : embedded ? (
          <span
            className={`inline-block max-w-[10rem] truncate align-middle ${!h.comment ? 'text-slate-300' : ''}`}
            title={h.comment && h.comment.length > 0 ? h.comment : undefined}
          >
            {h.comment ?? '-'}
          </span>
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
      width: embedded ? '96px' : '130px',
      sortable: false,
      render: (h) => {
        if (editingId === h.id) {
          return (
            <div className={`flex ${embedded ? 'gap-0.5' : 'gap-1'}`}>
              <button
                type="button"
                onClick={() => handleSave(h)}
                className={
                  embedded
                    ? 'rounded bg-blue-500 px-1 py-0.5 text-[10px] text-white hover:bg-blue-600'
                    : 'rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600'
                }
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className={
                  embedded
                    ? 'rounded bg-slate-200 px-1 py-0.5 text-[10px] text-slate-700 hover:bg-slate-300'
                    : 'rounded bg-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-300'
                }
              >
                取消
              </button>
            </div>
          )
        }
        return (
          <div className={`flex ${embedded ? 'gap-0.5' : 'gap-1'}`}>
            <button
              type="button"
              onClick={() => handleEdit(h)}
              className={
                embedded
                  ? 'rounded px-1 py-0.5 text-[10px] text-blue-500 hover:bg-blue-50 hover:text-blue-600'
                  : 'rounded px-2 py-1 text-xs text-blue-500 hover:bg-blue-50 hover:text-blue-600'
              }
            >
              編集
            </button>
            <button
              type="button"
              onClick={() => handleDelete(h)}
              className={
                embedded
                  ? 'rounded px-1 py-0.5 text-[10px] text-rose-500 hover:bg-rose-50 hover:text-rose-600'
                  : 'rounded px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-600'
              }
            >
              削除
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <div className={embedded ? 'space-y-1.5' : 'space-y-3'}>
      <DataTable
        data={sorted}
        columns={columns}
        keyField="id"
        emptyMessage="接触履歴がありません"
        density={embedded ? 'compact' : 'default'}
        cellNoWrap={embedded}
        stickyHeader
        bodyMaxHeightClassName={
          embedded ? 'max-h-[10.5rem]' : 'max-h-[min(55vh,32rem)]'
        }
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
              targetType,
              ...(targetType === '債権者' ? { creditorName: null as string | null } : {}),
              comment: null,
            },
          })
          setEditingId(newId)
          setEditData({
            contactDate: null,
            contactTime: null,
            staff: null,
            tool: null,
            creditorName: null,
            comment: null,
          })
        }}
        className={
          embedded
            ? 'w-full rounded border border-dashed border-blue-300 py-1 text-[11px] text-blue-500 transition-colors hover:bg-blue-50'
            : 'w-full rounded border border-dashed border-blue-300 py-2 text-sm text-blue-500 transition-colors hover:bg-blue-50'
        }
      >
        + 接触履歴を追加
      </button>
    </div>
  )
}
