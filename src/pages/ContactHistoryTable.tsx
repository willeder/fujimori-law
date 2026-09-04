import { useMemo, useRef, useState } from 'react'
import { useCaseEdit } from '../context/CaseEditContext'
import { DataTable, type Column } from '../components'
import { SuggestInput } from '../components/SuggestInput'
import { useCreditorNames } from '../hooks/useCreditorNames'
import { useUserSettings } from '../context/UserSettingsContext'
import { useCaseDispatch, useCaseState } from '../store/useCaseStore'
import type { ContactHistory } from '../types'
import { RowDateInput } from '../components/RowDateInput'
import { checkYmdFields } from '../lib/rowEditValue'

interface ContactHistoryTableProps {
  caseId: number
  histories: ContactHistory[]
  /** この表の対象（追加行の targetType に使用） */
  targetType: '依頼者' | '債権者'
}

// ツールと担当は kintone のフォーム定義（アプリ4）に合わせる。
// ツールは依頼者と債権者で選択肢が違う点に注意。
import {
  CONTACT_TOOL_CLIENT_OPTIONS,
  CONTACT_TOOL_CREDITOR_OPTIONS,
  CONTACT_STAFF_OPTIONS,
} from '../constants/fieldOptions'

export function ContactHistoryTable({
  caseId,
  histories,
  targetType,
}: ContactHistoryTableProps) {
  // ロック中（他セッションが編集中）は行の編集・追加・削除を無効化する
  const { locked } = useCaseEdit()
  const dispatch = useCaseDispatch()
  const toolOptions =
    targetType === '債権者' ? CONTACT_TOOL_CREDITOR_OPTIONS : CONTACT_TOOL_CLIENT_OPTIONS
  const { contactHistories } = useCaseState()
  const { accountName } = useUserSettings()
  // 債権者名の候補（検索モードの条件入力・行編集のドロップダウン用）
  const creditorNames = useCreditorNames()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<Partial<ContactHistory>>({})
  // まだDB保存していない新規行（合成ID）。保存時にPOST→実IDへ差替え
  const [newIds, setNewIds] = useState<Set<number>>(() => new Set())
  // コメント全行表示のトグル（通常は2行まで、クリックで全行）
  const [expandedComments, setExpandedComments] = useState<Set<number>>(() => new Set())
  const toggleComment = (id: number) =>
    setExpandedComments((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const wrapperRef = useRef<HTMLDivElement>(null)

  /** 追加直後に最下段（新規行）まで縦スクロール */
  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const scroller = wrapperRef.current?.querySelector<HTMLElement>('.overflow-auto')
      if (scroller) scroller.scrollTop = scroller.scrollHeight
    })
  }

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
    // 時系列の昇順（上が古い・下が新しい）。新規行は現在時刻なので最下段に並ぶ
    const toKey = (h: ContactHistory) =>
      `${h.contactDate ?? ''} ${h.contactTime ?? ''} ${String(h.id).padStart(8, '0')}`
    return [...histories].sort((a, b) => toKey(a).localeCompare(toKey(b)))
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
    const ng = checkYmdFields(editData, [['contactDate', '日付']])
    if (ng) {
      window.alert(ng)
      return
    }
    const payload = {
      contactDate: editData.contactDate ?? null,
      contactTime: editData.contactTime ?? null,
      staff: editData.staff ?? null,
      tool: editData.tool ?? null,
      creditorName: targetType === '債権者' ? (editData.creditorName ?? null) : null,
      comment: editData.comment ?? null,
    }
    // 楽観的にローカル反映
    dispatch({ type: 'UPDATE_CONTACT_HISTORY', payload: { ...h, ...payload } })
    setEditingId(null)
    setEditData({})
    if (newIds.has(h.id)) {
      // 新規行 → サーバに作成し、合成IDを実IDへ差し替え
      void fetch('/api/contact-histories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, targetType, ...payload }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((res: { row?: ContactHistory } | null) => {
          if (res?.row) {
            dispatch({ type: 'DELETE_CONTACT_HISTORY', payload: h.id })
            dispatch({ type: 'ADD_CONTACT_HISTORY', payload: res.row })
          }
        })
        .catch((e) => console.error('接触履歴の作成に失敗:', e))
      setNewIds((prev) => {
        const n = new Set(prev)
        n.delete(h.id)
        return n
      })
    } else {
      void fetch(`/api/contact-histories/${h.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((e) => console.error('接触履歴の更新に失敗:', e))
    }
  }

  /**
   * 取消。
   * 「+ 接触履歴を追加」で作った行はまだサーバに存在しない仮の行なので、
   * 取消したら行ごと消す（残すと空欄だけの枠が一覧に居座る＝修正依頼㉟）。
   * 既存行の編集を取り消した場合は行を消さず、編集内容だけ破棄する。
   */
  const handleCancel = () => {
    const id = editingId
    setEditingId(null)
    setEditData({})
    if (id != null && newIds.has(id)) {
      dispatch({ type: 'DELETE_CONTACT_HISTORY', payload: id })
      setNewIds((prev) => {
        const n = new Set(prev)
        n.delete(id)
        return n
      })
    }
  }

  const handleDelete = (h: ContactHistory) => {
    const ok = window.confirm(
      'この接触履歴を削除しますか？\n「OK」で削除、「キャンセル」で取りやめます。',
    )
    if (!ok) return
    dispatch({ type: 'DELETE_CONTACT_HISTORY', payload: h.id })
    if (newIds.has(h.id)) {
      // 未保存の新規行はローカル削除のみ
      setNewIds((prev) => {
        const n = new Set(prev)
        n.delete(h.id)
        return n
      })
    } else {
      void fetch(`/api/contact-histories/${h.id}`, { method: 'DELETE' }).catch((e) =>
        console.error('接触履歴の削除に失敗:', e)
      )
    }
  }

  const cellIn = 'w-full rounded border border-blue-300 px-1.5 py-0.5 text-xs leading-tight'

  const creditorColumn: Column<ContactHistory>[] =
    targetType === '債権者'
      ? [
          {
            key: 'creditorName',
            header: '債権者',
            width: '12rem',
            sortable: false,
            cellTruncate: false,
            // 検索モード（Shift+F）の条件入力に債権者候補ドロップダウンを表示
            filterSuggestions: creditorNames,
            render: (h) =>
              editingId === h.id ? (
                // 行編集時も候補から選択可能（クリックで一覧・入力で絞込・自由入力も可）
                <SuggestInput
                  value={editData.creditorName ?? ''}
                  onValueChange={(v) =>
                    setEditData({ ...editData, creditorName: v || null })
                  }
                  suggestions={creditorNames}
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
      header: '日付',
      width: '7rem',
      sortable: false,
      render: (h) =>
        editingId === h.id ? (
          <RowDateInput
            value={editData.contactDate}
            onChange={(v) => setEditData({ ...editData, contactDate: v })}
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
      width: '6rem',
      align: 'center',
      sortable: false,
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
      width: '5rem',
      sortable: false,
      render: (h) =>
        editingId === h.id ? (
          <select
            value={editData.staff ?? ''}
            onChange={(e) => setEditData({ ...editData, staff: e.target.value || null })}
            className={cellIn}
          >
            <option value="">-</option>
            {/* 退職などで選択肢から外れた担当が既存データに残っているため、
                現在値が一覧に無ければ先頭に足して記録を消さない */}
            {editData.staff && !CONTACT_STAFF_OPTIONS.includes(editData.staff as never) && (
              <option value={editData.staff}>{editData.staff}（現在の値）</option>
            )}
            {CONTACT_STAFF_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : (
          <span className={!h.staff ? 'text-slate-300' : ''}>{h.staff ?? '-'}</span>
        ),
    },
    {
      key: 'tool',
      header: 'ツール',
      width: '5.5rem',
      sortable: false,
      render: (h) =>
        editingId === h.id ? (
          <select
            value={editData.tool ?? ''}
            onChange={(e) => setEditData({ ...editData, tool: e.target.value || null })}
            className={cellIn}
          >
            <option value="">-</option>
            {editData.tool && !toolOptions.includes(editData.tool as never) && (
              <option value={editData.tool}>{editData.tool}（現在の値）</option>
            )}
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
      sortable: false,
      cellTruncate: false,
      cellMultiline: true,
      render: (h) =>
        editingId === h.id ? (
          <textarea
            value={editData.comment ?? ''}
            onChange={(e) => setEditData({ ...editData, comment: e.target.value })}
            className="w-full min-h-[3rem] rounded border border-blue-300 px-1.5 py-0.5 text-xs leading-snug resize-y"
            placeholder="コメント"
            rows={2}
          />
        ) : (
          <div
            onClick={(e) => {
              e.stopPropagation()
              if (h.comment) toggleComment(h.id)
            }}
            title={expandedComments.has(h.id) ? 'クリックで折りたたむ' : '全行表示'}
            className={`whitespace-pre-wrap break-words leading-snug ${
              h.comment ? 'cursor-pointer' : 'text-slate-300'
            } ${expandedComments.has(h.id) ? '' : 'line-clamp-2'}`}
          >
            {h.comment ?? '-'}
          </div>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: '7rem',
      sortable: false,
      cellTruncate: false,
      render: (h) => {
        if (editingId === h.id) {
          return (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  const record = contactHistories.find((r) => r.id === editingId) ?? histories.find((r) => r.id === editingId)
                  if (record) handleSave(record)
                }}
                className="rounded bg-blue-500 px-2 py-0.5 text-xs text-white hover:bg-blue-600"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-300"
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
              disabled={locked}
              title={locked ? '他の人が編集中のため、いまは変更できません' : undefined}
              className="rounded px-2 py-0.5 text-xs text-blue-500 hover:bg-blue-50 hover:text-blue-600 disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              編集
            </button>
            <button
              type="button"
              onClick={() => handleDelete(h)}
              disabled={locked}
              title={locked ? '他の人が編集中のため、いまは変更できません' : undefined}
              className="rounded px-2 py-0.5 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-600 disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              削除
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <div ref={wrapperRef} className="flex min-h-0 w-full flex-1 flex-col gap-1.5">

      <div className="w-full">
        <div className="w-full rounded-md border border-slate-100/80 bg-slate-50/60 px-2 py-1 font-medium">
          <DataTable
            data={sorted}
            columns={columns}
            keyField="id"
            emptyMessage="接触履歴がありません"
            density="default"
            stickyHeader
            cellSingleLine
            suspendTruncate={editingId !== null}
            bodyMaxHeightClassName="max-h-[min(55vh,32rem)]"
            enableFind
          />
        </div>
      </div>

      {editingId == null && (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => {
              const { date: currentDate, time: currentTime } = getLocalNow()
              const staffName = accountName || null

              const newId = Math.max(0, ...contactHistories.map((h) => h.id)) + 1
              setNewIds((prev) => new Set(prev).add(newId))
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
              scrollToBottom()
            }}
            disabled={locked}
            title={locked ? '他の人が編集中のため、いまは変更できません' : undefined}
            className="min-h-[1.75rem] rounded-md border border-slate-100/80 bg-slate-50/60 px-2 py-0.5 text-xs leading-none text-blue-600 transition-colors hover:bg-blue-50 disabled:text-slate-300 disabled:hover:bg-slate-50/60"
          >
            + 接触履歴を追加
          </button>
        </div>
      )}
    </div>
  )
}
