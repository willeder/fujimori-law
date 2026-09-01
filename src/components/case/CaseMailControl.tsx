/**
 * 案件からのメール送信＋送信履歴（No.92/93）。
 * ヘッダーの「メール」ボタンからモーダルを開き、依頼者メール宛の送信と
 * この案件の送信履歴の閲覧ができる。送信基盤（Resend/SendGrid）は
 * サーバ側の環境変数設定に依存し、未設定の場合はその旨を表示する。
 */
import { useCallback, useState } from 'react'

type MailLog = {
  id: number
  caseId: number | null
  toAddress: string
  subject: string
  body: string
  status: 'SENT' | 'FAILED'
  error: string | null
  sentBy: string
  createdAt: string
}

export function CaseMailControl({
  caseId,
  defaultTo,
}: {
  caseId: number
  defaultTo: string | null
}) {
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState(defaultTo ?? '')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null)
  const [history, setHistory] = useState<MailLog[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/mail/history?caseId=${caseId}`).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/mail/status').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([h, s]) => {
        setHistory(h as MailLog[])
        setConfigured((s as { configured?: boolean } | null)?.configured ?? false)
      })
      .catch(() => {
        /* noop */
      })
  }, [caseId])

  const openModal = () => {
    setTo((cur) => cur || (defaultTo ?? ''))
    setOpen(true)
    load()
  }

  const send = async () => {
    setSending(true)
    setNotice(null)
    try {
      const r = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, to, subject, text }),
      })
      const body = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok || !body.ok) {
        setNotice({ ok: false, msg: body.error ?? `送信に失敗しました（HTTP ${r.status}）` })
      } else {
        setNotice({ ok: true, msg: '送信しました' })
        setSubject('')
        setText('')
      }
      void load()
    } catch (e) {
      setNotice({ ok: false, msg: `送信に失敗しました: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center rounded bg-slate-600 px-3 py-1 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        title="メール送信・履歴"
      >
        ✉ メール
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-[40rem] max-w-[95vw] flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
              <span className="text-sm font-semibold text-slate-700">メール送信・履歴</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-0.5 text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-slate-200">
              {/* 送信フォーム */}
              <div className="flex flex-col gap-2 overflow-y-auto p-3">
                {configured === false && (
                  <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[0.6875rem] text-amber-800">
                    メール送信の設定（RESEND_API_KEY / SENDGRID_API_KEY・MAIL_FROM）が
                    未設定のため送信できません。履歴の閲覧は可能です。
                  </div>
                )}
                <label className="flex flex-col gap-0.5 text-[0.6875rem] text-slate-500">
                  宛先
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="mail@example.com"
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[0.6875rem] text-slate-500">
                  件名
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                </label>
                <label className="flex min-h-0 flex-1 flex-col gap-0.5 text-[0.6875rem] text-slate-500">
                  本文
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={10}
                    className="min-h-[10rem] flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                </label>
                {notice && (
                  <div
                    className={`rounded px-2 py-1 text-[0.6875rem] ${
                      notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {notice.msg}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || configured === false || !to || !subject || !text.trim()}
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  {sending ? '送信中…' : '送信する'}
                </button>
              </div>
              {/* 履歴 */}
              <div className="overflow-y-auto p-3">
                <div className="mb-1 text-[0.6875rem] font-semibold text-slate-500">
                  この案件の送信履歴（{history.length}件）
                </div>
                {history.length === 0 ? (
                  <div className="py-4 text-center text-[0.6875rem] text-slate-400">
                    送信履歴はありません
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {history.map((h) => (
                      <li key={h.id} className="py-1.5 text-[0.6875rem]">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 text-left"
                          onClick={() => setExpanded(expanded === h.id ? null : h.id)}
                        >
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-semibold ${
                              h.status === 'SENT'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {h.status === 'SENT' ? '送信済' : '失敗'}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                            {h.subject}
                          </span>
                          <span className="shrink-0 text-[0.625rem] text-slate-400">
                            {h.createdAt.slice(0, 16).replace('T', ' ')}
                          </span>
                        </button>
                        {expanded === h.id && (
                          <div className="mt-1 rounded bg-slate-50 p-2">
                            <div className="text-[0.625rem] text-slate-500">
                              宛先: {h.toAddress} ／ 送信者: {h.sentBy}
                            </div>
                            {h.error && (
                              <div className="text-[0.625rem] text-red-600">エラー: {h.error}</div>
                            )}
                            <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-[0.6875rem] text-slate-700">
                              {h.body}
                            </pre>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
