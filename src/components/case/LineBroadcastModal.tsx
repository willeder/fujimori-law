/**
 * LINE 一斉送信モーダル（作成・確認・送信）と 送信履歴モーダル。
 * 送信対象は「連携済み（lineLinked）」の宛先のみ。未連携はスキップ。
 * 本文は差し込み変数 {名前} {フリガナ} {ID} を受信者ごとに置換（サーバ側）。
 */
import { useEffect, useState } from 'react'

export type Recipient = { id: number; name: string | null; lineLinked: boolean }

type SendResult = {
  ok: boolean
  total?: number
  sent?: number
  skipped?: number
  failed?: number
  error?: string
}

export function LineBroadcastModal({
  open,
  onClose,
  recipients,
}: {
  open: boolean
  onClose: () => void
  recipients: Recipient[]
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  if (!open) return null

  const linked = recipients.filter((r) => r.lineLinked)
  const send = async () => {
    setSending(true)
    setResult(null)
    try {
      const r = await fetch('/api/line/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseIds: recipients.map((x) => x.id), message }),
      })
      setResult((await r.json()) as SendResult)
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="mt-12 w-full max-w-xl rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-bold text-slate-800">LINE一斉送信</h2>
          <button onClick={onClose} className="rounded px-2 text-lg text-slate-400 hover:bg-slate-100">×</button>
        </div>
        <div className="space-y-2 p-4">
          <div className="rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
            選択 <b>{recipients.length}</b>件 / 連携済み <b className="text-emerald-700">{linked.length}</b>件（送信対象） / 未連携{' '}
            <b className="text-slate-500">{recipients.length - linked.length}</b>件（スキップ）
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="本文を入力。差し込み: {名前} {フリガナ} {ID}"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="text-[10px] text-slate-400">
            差し込み変数: {'{名前}'} ・ {'{フリガナ}'} ・ {'{ID}'}（受信者ごとに自動置換）
          </div>
          {result &&
            (result.ok ? (
              <div className="rounded bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
                送信 {result.sent}件 / 未連携スキップ {result.skipped}件 / 失敗 {result.failed}件
              </div>
            ) : (
              <div className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
                {result.error ?? '送信に失敗しました'}
              </div>
            ))}
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-2">
          <button
            onClick={send}
            disabled={sending || linked.length === 0 || !message.trim()}
            className="rounded bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {sending ? '送信中…' : `送信（連携済み${linked.length}件）`}
          </button>
          <button onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
            閉じる
          </button>
          {linked.length === 0 && (
            <span className="text-[10px] text-amber-600">連携済みの宛先がありません</span>
          )}
        </div>
      </div>
    </div>
  )
}

type HistoryRow = {
  id: string
  actor: string
  createdAt: string
  message: string
  total: number
  sent: number
  skipped: number
  failed: number
}

export function LineHistoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  useEffect(() => {
    if (!open) return
    setRows(null)
    fetch('/api/line/broadcast-history')
      .then((r) => (r.ok ? (r.json() as Promise<HistoryRow[]>) : []))
      .then(setRows)
      .catch(() => setRows([]))
  }, [open])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="mt-12 w-full max-w-2xl rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-bold text-slate-800">LINE送信履歴</h2>
          <button onClick={onClose} className="rounded px-2 text-lg text-slate-400 hover:bg-slate-100">×</button>
        </div>
        <div className="max-h-[60vh] overflow-auto p-2">
          {rows === null ? (
            <p className="px-3 py-3 text-xs text-slate-400">読み込み中…</p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-400">送信履歴はありません。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((h) => (
                <li key={h.id} className="px-3 py-2 text-xs">
                  <div className="text-[10px] text-slate-400">
                    {h.createdAt.slice(0, 16).replace('T', ' ')} ・ {h.actor} ・ 送信
                    <span className="text-emerald-700">{h.sent}</span> / 未連携{h.skipped} / 失敗
                    <span className="text-red-600">{h.failed}</span>
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap break-words text-slate-700">{h.message}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
