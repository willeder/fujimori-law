/**
 * 入金催促通知ページ。
 * 4タイミング（3日前 / 前日 / 当日1回目 / 当日2回目）で送信対象を抽出し、
 * テンプレ文（差し込み変数つき）を選択・編集して LINE で手動送信する。
 * 送信は連携済み（LINKED）のみ。未連携・送信済みはスキップ。
 * 自動送信（cron）はサーバ側にロジックを用意済み（現状は未有効化）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'

type Timing = '3D' | '1D' | '0D_1' | '0D_2'

const TIMINGS: { id: Timing; label: string; hint: string }[] = [
  { id: '3D', label: '3日前', hint: '支払期日の3日前' },
  { id: '1D', label: '前日', hint: '支払期日の前日' },
  { id: '0D_1', label: '当日1回目', hint: '当日の午前など' },
  { id: '0D_2', label: '当日2回目', hint: '当日16:00時点で未入金の方' },
]

type Candidate = {
  caseId: number
  name: string | null
  furigana: string | null
  externalId: string | null
  plannedDate: string
  plannedAmount: number | null
  vAccountBranch: string | null
  vAccountNumber: string | null
  lineLinked: boolean
  alreadySent: boolean
}

type CandidatesResponse = {
  timing: string
  label: string
  targetDate: string
  defaultTemplate: string
  candidates: Candidate[]
}

type SendDetail = {
  caseId: number
  name: string | null
  result: 'sent' | 'skipped' | 'failed'
  reason?: string
}

type SendResult = {
  ok: boolean
  error?: string
  targetDate?: string
  total?: number
  sent?: number
  skipped?: number
  failed?: number
  results?: SendDetail[]
}

/** クライアント側プレビュー用の差し込み（サーバの fillReminderTemplate と等価） */
function duePhrase(timing: Timing, dateStr: string): string {
  if (!dateStr) return ''
  const m = Number(dateStr.slice(5, 7))
  const d = Number(dateStr.slice(8, 10))
  const md = `${m}月${d}日`
  if (timing === '3D') return `3日後の${md}`
  if (timing === '1D') return `明日${md}`
  return `本日${md}`
}

function fillTemplate(tpl: string, c: Candidate, timing: Timing): string {
  return tpl
    .replace(/\{名前\}/g, c.name ?? '')
    .replace(/\{フリガナ\}/g, c.furigana ?? '')
    .replace(/\{ID\}/g, c.externalId ?? '')
    .replace(/\{期日\}/g, duePhrase(timing, c.plannedDate))
    .replace(/\{支店名\}/g, c.vAccountBranch ?? '')
    .replace(/\{口座番号\}/g, c.vAccountNumber ?? '')
    .replace(/\{入金額\}/g, c.plannedAmount != null ? `${c.plannedAmount.toLocaleString()}円` : '')
}

export function PaymentReminderPage() {
  const [timing, setTiming] = useState<Timing>('3D')
  const [data, setData] = useState<CandidatesResponse | null>(null)
  const [template, setTemplate] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // 候補を取得して反映。setState は await 後のみ（effect 内での同期的な副作用を避ける）。
  const load = useCallback(async (t: Timing) => {
    try {
      const r = await fetch(`/api/reminders/candidates?timing=${t}`)
      const d = (await r.json()) as CandidatesResponse
      setData(d)
      setTemplate(d.defaultTemplate)
      // 既定の選択: 連携済み かつ 未送信
      setSelected(
        new Set(
          d.candidates.filter((c) => c.lineLinked && !c.alreadySent).map((c) => c.caseId)
        )
      )
    } catch {
      setData({ timing: t, label: '', targetDate: '', defaultTemplate: '', candidates: [] })
    }
  }, [])

  // タイミング変更時の取得（setState は .then コールバック内＝同期副作用を避ける）
  useEffect(() => {
    let cancelled = false
    fetch(`/api/reminders/candidates?timing=${timing}`)
      .then((r) => r.json() as Promise<CandidatesResponse>)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setTemplate(d.defaultTemplate)
        setSelected(
          new Set(
            d.candidates.filter((c) => c.lineLinked && !c.alreadySent).map((c) => c.caseId)
          )
        )
      })
      .catch(() => {
        if (!cancelled)
          setData({ timing, label: '', targetDate: '', defaultTemplate: '', candidates: [] })
      })
    return () => {
      cancelled = true
    }
  }, [timing])

  // data === null はロード中（タイミング切替時は onClick で null に戻す）
  const loading = data === null
  const candidates = useMemo(() => data?.candidates ?? [], [data])
  const sendableIds = useMemo(
    () => candidates.filter((c) => c.lineLinked && !c.alreadySent).map((c) => c.caseId),
    [candidates]
  )
  const selectedSendable = useMemo(
    () => [...selected].filter((id) => sendableIds.includes(id)),
    [selected, sendableIds]
  )

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allSelected = sendableIds.length > 0 && sendableIds.every((id) => selected.has(id))
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(sendableIds))

  // 一覧で案件をクリックしたら、その案件をプレビュー対象にする（手動送信用にコピーできる）
  const [pickedId, setPickedId] = useState<number | null>(null)
  const previewCandidate =
    (pickedId != null ? candidates.find((c) => c.caseId === pickedId) : undefined) ??
    candidates.find((c) => selectedSendable.includes(c.caseId)) ??
    candidates.find((c) => c.lineLinked) ??
    candidates[0]

  const [copied, setCopied] = useState(false)
  const copyPreview = async () => {
    if (!previewCandidate) return
    try {
      await navigator.clipboard.writeText(fillTemplate(template, previewCandidate, timing))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* noop */
    }
  }

  const send = async () => {
    if (selectedSendable.length === 0 || !template.trim()) return
    setSending(true)
    setResult(null)
    try {
      const r = await fetch('/api/reminders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timing, caseIds: selectedSendable, template }),
      })
      setResult((await r.json()) as SendResult)
      await load(timing) // 送信済み状態を反映
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setSending(false)
    }
  }

  const linkedCount = candidates.filter((c) => c.lineLinked).length
  const sentCount = candidates.filter((c) => c.alreadySent).length

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="入金催促">
        <div className="flex flex-wrap items-center gap-1.5">
          {TIMINGS.map((t) => {
            const active = timing === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (timing === t.id) return
                  setData(null)
                  setResult(null)
                  setTiming(t.id)
                }}
                title={t.hint}
                className={
                  'rounded-md border px-3 py-1 text-xs transition-colors ' +
                  (active
                    ? 'cursor-default border-blue-600 bg-blue-600 font-semibold text-white shadow-sm'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100')
                }
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </AppHeader>

      <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[1fr_minmax(360px,420px)]">
        {/* 左: 対象一覧 */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">
              {TIMINGS.find((t) => t.id === timing)?.label} の対象
            </span>
            <span>
              支払期日: <b className="tabular-nums">{data?.targetDate || '-'}</b>
            </span>
            <span>
              対象 <b>{candidates.length}</b>件 / 連携済み{' '}
              <b className="text-emerald-700">{linkedCount}</b>件 / 送信済み{' '}
              <b className="text-slate-500">{sentCount}</b>件
            </span>
            <span className="ml-auto">
              選択 <b className="text-blue-700">{selectedSendable.length}</b>件（送信対象）
            </span>
          </div>

          {loading ? (
            <PageLoading message="対象を抽出中…" />
          ) : candidates.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-slate-500">
              該当する送信対象がありません。
            </p>
          ) : (
            <div className="max-h-[calc(100vh-220px)] overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="w-8 px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={sendableIds.length === 0}
                        aria-label="全選択"
                      />
                    </th>
                    <th className="px-2 py-1.5 text-left">ID</th>
                    <th className="px-2 py-1.5 text-left">名前</th>
                    <th className="px-2 py-1.5 text-right">入金額</th>
                    <th className="px-2 py-1.5 text-left">V口座(支店/番号)</th>
                    <th className="px-2 py-1.5 text-center">LINE</th>
                    <th className="px-2 py-1.5 text-center">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const sendable = c.lineLinked && !c.alreadySent
                    return (
                      <tr
                        key={c.caseId}
                        onClick={() => {
                          setPickedId(c.caseId)
                          setShowPreview(true)
                        }}
                        title="クリックでこの案件をプレビューに反映（コピーして手動送信）"
                        className={
                          'cursor-pointer border-t border-slate-100 ' +
                          (pickedId === c.caseId
                            ? 'bg-blue-100/70 '
                            : sendable
                              ? 'hover:bg-blue-50/40 '
                              : 'bg-slate-50/50 text-slate-400 ')
                        }
                      >
                        <td className="px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={selected.has(c.caseId)}
                            onChange={() => toggle(c.caseId)}
                            onClick={(e) => e.stopPropagation()}
                            disabled={!sendable}
                            aria-label={`${c.name ?? c.caseId} を選択`}
                          />
                        </td>
                        <td className="px-2 py-1 tabular-nums">{c.externalId ?? '-'}</td>
                        <td className="px-2 py-1">{c.name ?? '-'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {c.plannedAmount != null ? `${c.plannedAmount.toLocaleString()}円` : '-'}
                        </td>
                        <td className="px-2 py-1 tabular-nums">
                          {c.vAccountBranch || c.vAccountNumber
                            ? `${c.vAccountBranch ?? '-'} / ${c.vAccountNumber ?? '-'}`
                            : '-'}
                        </td>
                        <td className="px-2 py-1 text-center">
                          {c.lineLinked ? (
                            <span className="text-emerald-700">連携済</span>
                          ) : (
                            <span className="text-amber-600">未連携</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-center">
                          {c.alreadySent ? (
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[0.625rem] text-slate-600">
                              送信済
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 右: テンプレ編集・プレビュー・送信 */}
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">テンプレート</h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={copyPreview}
                  disabled={!previewCandidate}
                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                  title="プレビュー対象の本文（差し込み済み）をコピー"
                >
                  {copied ? 'コピーしました' : '本文をコピー'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className="rounded border border-slate-300 px-2 py-0.5 text-[0.6875rem] text-slate-600 hover:bg-slate-50"
                >
                  {showPreview ? '編集に戻す' : 'プレビュー'}
                </button>
              </div>
            </div>

            {showPreview ? (
              <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                {previewCandidate
                  ? fillTemplate(template, previewCandidate, timing)
                  : '対象がいないためプレビューできません。'}
              </pre>
            ) : (
              <textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={18}
                className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            <div className="mt-1.5 text-[0.625rem] leading-relaxed text-slate-400">
              差し込み変数（受信者ごとに自動置換）:<br />
              {'{名前}'} ・ {'{フリガナ}'} ・ {'{ID}'} ・ {'{期日}'} ・ {'{支店名}'} ・{' '}
              {'{口座番号}'} ・ {'{入金額}'}
              <br />
              {showPreview && previewCandidate
                ? `プレビュー対象: ${previewCandidate.name ?? previewCandidate.caseId}`
                : ''}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <button
              onClick={send}
              disabled={sending || selectedSendable.length === 0 || !template.trim()}
              className="w-full rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {sending
                ? '送信中…'
                : `LINE送信（選択 ${selectedSendable.length}件）`}
            </button>
            {selectedSendable.length === 0 && (
              <p className="mt-1.5 text-center text-[0.6875rem] text-amber-600">
                送信可能（連携済み・未送信）な対象を選択してください
              </p>
            )}

            {result &&
              (result.ok ? (
                <div className="mt-2 rounded bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
                  送信 {result.sent}件 / スキップ {result.skipped}件 / 失敗 {result.failed}件
                  {result.failed ? (
                    <ul className="mt-1 list-disc pl-4 text-red-600">
                      {result.results
                        ?.filter((r) => r.result === 'failed')
                        .map((r) => (
                          <li key={r.caseId}>
                            {r.name ?? r.caseId}: {r.reason}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
                  {result.error ?? '送信に失敗しました'}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
