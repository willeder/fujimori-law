/**
 * GMO一括振込ファイル出力（弁済代行）。
 * 対象期間を指定 → プレビュー → Shift-JIS CSV ダウンロード。
 * 既存 Excel「GMO一括振込ファイル変換マシン」の判定・整形ロジックをサーバ移植。
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '../components'
import { AppHeader } from '../components/AppHeader'
import { PageLoading } from '../components/PageLoading'

type IncompleteRow = {
  creditorId: number
  caseId: number
  externalId: string | null
  clientName: string | null
  creditorName: string
  status: string
  settlementDate: string | null
  scheduleMissing: boolean
  accountMissing: boolean
  /** 支払開始日が未入力で、対象月に支払いが必要かを判定できない */
  monthUnknown: boolean
}
type IncompleteResult = {
  rows: IncompleteRow[]
  count: number
  scheduleMissingCount: number
  accountMissingCount: number
  monthUnknownCount: number
}

type WebhookEventRow = {
  id: number
  eventKey: string
  eventType: string | null
  sourceIp: string | null
  status: string
  parsedRows: number
  reflected: number
  message: string | null
  receivedAt: string
}
type WebhookEvents = {
  rows: WebhookEventRow[]
  counts: {
    total: number
    applied: number
    unparsed: number
    failed: number
    noTarget: number
    rejected: number
  }
}

type GmoRow = {
  bankCode: string
  branchCode: string
  depositType: string
  accountNumber: string
  payeeName: string
  amount: number | null
  payerName: string
  caseId: number
  externalId: string | null
  clientName: string | null
  creditorName: string
  round: '1回目' | '2回目以降'
  transferDate: string
  incomplete: boolean
}
type GmoResult = {
  periodStart: string
  periodEnd: string
  refDate: string
  rows: GmoRow[]
  count: number
  incompleteCount: number
  overLimit: boolean
}
type Row = GmoRow & { _i: number }

export function GmoTransferPage() {
  const navigate = useNavigate()
  const today = new Date().toISOString().slice(0, 10)
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [result, setResult] = useState<GmoResult | null>(null)
  const [loading, setLoading] = useState(false)

  // 当月判定の対象月（YYYY-MM）＝対象期間（開始日）の年月
  const month = start.slice(0, 7)

  // ── GMOあおぞらAPI連携ステータス（No.153）──
  const [apiStatus, setApiStatus] = useState<{
    configured: boolean
    connected: boolean
    expiresAt: string | null
    base: string
  } | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/gmo/auth/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setApiStatus(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const startGmoAuth = async () => {
    try {
      const r = await fetch('/api/gmo/auth/url')
      const d = (await r.json()) as { url?: string; error?: string }
      if (!r.ok || !d.url) {
        window.alert(d.error ?? '認可URLの取得に失敗しました')
        return
      }
      // 銀行のログイン・認可画面を別タブで開く（認可完了でコールバックに戻る）
      window.open(d.url, '_blank', 'noopener')
    } catch (e) {
      window.alert(`認可URLの取得に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // GMO からの入金通知（Webhook）の受信履歴。
  // 受け口は api/gmo/webhook.ts。ここでは「届いているか」「反映できたか」を見る。
  const [events, setEvents] = useState<WebhookEvents | null>(null)
  const [showEvents, setShowEvents] = useState(false)
  const [eventsKey, setEventsKey] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch('/api/gmo/webhook/events?limit=50')
      .then((r) => (r.ok ? (r.json() as Promise<WebhookEvents>) : null))
      .then((d) => {
        if (!cancelled) setEvents(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [eventsKey])

  // 配信制御（仕様書「イベント通知編 v1.8.0」）。
  // 受け口を用意しただけでは通知は届かないため、ここから配信開始を要求する。
  const [notifyBusy, setNotifyBusy] = useState<'' | 'subscribe' | 'unsubscribe' | 'unsent'>('')

  const controlSubscription = async (start: boolean) => {
    if (
      !start &&
      !window.confirm(
        '配信を停止すると、以降の入金がシステムに自動反映されなくなります。停止しますか？'
      )
    )
      return
    setNotifyBusy(start ? 'subscribe' : 'unsubscribe')
    try {
      const r = await fetch('/api/gmo/webhook/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start }),
      })
      const d = (await r.json()) as { ok?: boolean; message?: string }
      window.alert(d.message ?? (d.ok ? '要求しました' : '要求に失敗しました'))
    } catch (e) {
      window.alert(`要求に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setNotifyBusy('')
    }
  }

  const collectUnsent = async () => {
    setNotifyBusy('unsent')
    try {
      const r = await fetch('/api/gmo/webhook/unsent', { method: 'POST' })
      const d = (await r.json()) as { ok?: boolean; message?: string }
      window.alert(d.message ?? (d.ok ? '回収しました' : '回収に失敗しました'))
      setEventsKey((k) => k + 1)
    } catch (e) {
      window.alert(`回収に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setNotifyBusy('')
    }
  }

  const reprocessEvent = async (id: number) => {
    try {
      const r = await fetch('/api/gmo/webhook/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const d = (await r.json()) as { ok?: boolean; message?: string }
      window.alert(d.message ?? (d.ok ? '再処理しました' : '再処理に失敗しました'))
      setEventsKey((k) => k + 1)
    } catch (e) {
      window.alert(`再処理に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 要対応（その月に支払いが必要なのに支払条件・振込先が未入力）の検知。
  // 対象月に連動して取得する（対象期間の開始月を変えると再取得）。
  const [incomplete, setIncomplete] = useState<IncompleteResult | null>(null)
  const [showIncomplete, setShowIncomplete] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/gmo/incomplete?month=${month}`)
      .then((r) => (r.ok ? (r.json() as Promise<IncompleteResult>) : null))
      .then((d) => {
        if (!cancelled) setIncomplete(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [month])

  const incompleteColumns: Column<IncompleteRow>[] = [
    { key: 'externalId', header: 'ID', width: '72px', render: (r) => r.externalId ?? '-' },
    { key: 'clientName', header: '依頼者', width: '110px', render: (r) => r.clientName ?? '-' },
    { key: 'creditorName', header: '債権者', width: '150px' },
    { key: 'status', header: 'ステータス', width: '96px' },
    { key: 'settlementDate', header: '和解日', width: '92px', render: (r) => r.settlementDate ?? '-' },
    {
      key: 'scheduleMissing',
      header: '不足',
      width: '150px',
      render: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.scheduleMissing && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">支払条件</span>
          )}
          {r.accountMissing && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">振込先口座</span>
          )}
          {r.monthUnknown && (
            <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              支払開始日なし
            </span>
          )}
        </span>
      ),
    },
  ]

  const preview = async () => {
    setLoading(true)
    try {
      const r = await fetch(
        `/api/gmo/transfers?start=${start}&end=${end}`
      )
      setResult(r.ok ? ((await r.json()) as GmoResult) : null)
    } catch {
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 振込ファイルのダウンロード。
   *
   * 事務所と確認した運用により、**出力＝振込実行の確定**として扱う。
   * サーバ側で弁済日・弁済充当額・社数（実績）・振)手数料 を入金スケジュールへ
   * 書き戻すため、押す前に必ず確認を挟む。
   * 記録結果は X-Repayment-Record ヘッダーで返るので、件数を画面に出す。
   */
  const [downloading, setDownloading] = useState(false)

  const download = async () => {
    const outputCount = (result?.count ?? 0) - (result?.incompleteCount ?? 0)
    if (
      !window.confirm(
        `振込ファイルを出力します。\n\n` +
          `出力と同時に、対象案件の入金スケジュールへ弁済実績（弁済日・弁済充当額・社数・振)手数料）を記録します。\n` +
          `対象 ${outputCount} 件。\n\n` +
          `※すでに弁済日が入っている行は上書きしません。\n` +
          `※記録は変更履歴に残るので、間違えたら取り消せます。\n\n` +
          `続けますか？`
      )
    )
      return
    setDownloading(true)
    try {
      const r = await fetch(`/api/gmo/transfers/file?start=${start}&end=${end}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const raw = r.headers.get('X-Repayment-Record')
      const blob = await r.blob()
      const isZip = (r.headers.get('Content-Type') ?? '').includes('zip')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gmo_transfer_${start}.${isZip ? 'zip' : 'csv'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      if (raw) {
        const rec = JSON.parse(decodeURIComponent(raw)) as {
          written: number
          skipped: number
          notFound: number
          notFoundIds: string[]
          totalAmount: number
          totalCount: number
        }
        const lines = [
          `弁済実績を記録しました。`,
          ``,
          `記録した入金行 : ${rec.written} 件`,
          `弁済充当額     : ${rec.totalAmount.toLocaleString()} 円`,
          `社数（実績）   : ${rec.totalCount} 社`,
          `振)手数料      : ${(rec.totalCount * 129).toLocaleString()} 円`,
        ]
        if (rec.skipped > 0) lines.push(``, `記録済みのためスキップ: ${rec.skipped} 件`)
        if (rec.notFound > 0)
          lines.push(
            ``,
            `⚠ 対応する入金行が見つからなかった案件: ${rec.notFound} 件`,
            rec.notFoundIds.slice(0, 20).join(', '),
            `→ 該当案件の入金スケジュールに、その月の予定行があるか確認してください`
          )
        window.alert(lines.join('\n'))
      }
    } catch (e) {
      window.alert(`出力に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDownloading(false)
    }
  }

  const rows = useMemo<Row[]>(() => {
    const base = (result?.rows ?? []).map((r, i) => ({ ...r, _i: i }))
    // 「口座情報不足」を先頭に。OK は後ろ。同状態内は元の並びを維持（安定ソート）
    return base.sort((a, b) => Number(b.incomplete) - Number(a.incomplete))
  }, [result])

  const yen = (n: number | null) => (n != null ? `${n.toLocaleString()}円` : '-')
  const columns: Column<Row>[] = [
    { key: 'externalId', header: 'ID', width: '72px', render: (r) => r.externalId ?? '-' },
    { key: 'clientName', header: '依頼者', width: '100px', render: (r) => r.clientName ?? '-' },
    { key: 'creditorName', header: '債権者', width: '150px' },
    { key: 'round', header: '回', width: '72px', align: 'center' },
    { key: 'transferDate', header: '振込日', width: '96px' },
    { key: 'bankCode', header: '銀行', width: '56px', align: 'center', render: (r) => r.bankCode || '-' },
    { key: 'branchCode', header: '支店', width: '52px', align: 'center', render: (r) => r.branchCode || '-' },
    { key: 'depositType', header: '種目', width: '48px', align: 'center', render: (r) => r.depositType || '-' },
    { key: 'accountNumber', header: '口座番号', width: '90px', render: (r) => r.accountNumber || '-' },
    { key: 'payeeName', header: '受取人名', width: '160px', render: (r) => r.payeeName || '-' },
    { key: 'amount', header: '金額', width: '96px', align: 'right', render: (r) => yen(r.amount) },
    { key: 'payerName', header: '振込依頼人名', width: '180px', render: (r) => r.payerName || '-' },
    {
      key: 'incomplete',
      header: '状態',
      width: '88px',
      align: 'center',
      render: (r) =>
        r.incomplete ? (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">口座情報不足</span>
        ) : (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">OK</span>
        ),
    },
  ]

  const outputCount = result ? result.count - result.incompleteCount : 0
  const fileCount = Math.max(1, Math.ceil(outputCount / 999))

  return (
    <div className="min-h-screen bg-slate-100">
      <AppHeader title="GMO一括振込ファイル出力">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-[10px] text-slate-500">
            対象期間（開始）
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-slate-500">
            〜（終了）
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
          </label>
          <button
            type="button"
            onClick={() => void preview()}
            className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            プレビュー
          </button>
          <button
            type="button"
            onClick={() => void download()}
            disabled={!result || outputCount === 0 || downloading}
            className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {downloading
              ? '出力中…'
              : fileCount > 1
                ? `ZIP一括ダウンロード（${outputCount}件・${fileCount}ファイル）`
                : `CSVダウンロード（${outputCount}件）`}
          </button>
        </div>
      </AppHeader>

      <div className="p-3">
        {/* GMOあおぞらAPI連携（No.153）: 入金リアルタイム反映・自動振込の前提となる認可 */}
        {apiStatus && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
            <span className="font-semibold text-slate-700">GMOあおぞらAPI連携</span>
            {apiStatus.connected ? (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                連携済み{apiStatus.expiresAt ? `（トークン期限: ${apiStatus.expiresAt.slice(0, 10)}）` : ''}
              </span>
            ) : apiStatus.configured ? (
              <>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">未連携</span>
                <button
                  type="button"
                  onClick={() => void startGmoAuth()}
                  className="rounded bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-700"
                >
                  銀行の認可画面を開いて連携する
                </button>
              </>
            ) : (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500">
                API設定待ち（契約完了後に GMO_CLIENT_ID 等を設定すると連携できます）
              </span>
            )}
            <span className="text-[10px] text-slate-400">接続先: {apiStatus.base}</span>
          </div>
        )}

        {/* GMO入金通知（Webhook）の受信状況。届いているか・反映できたかをここで見る */}
        {events && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setShowEvents((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="text-sm font-semibold text-slate-700">
                GMO入金通知（Webhook）
                <span className="ml-2 text-xs font-normal text-slate-500">
                  受信 {events.counts.total} 件（反映 {events.counts.applied} / 未突合{' '}
                  {events.counts.noTarget}
                  {events.counts.unparsed > 0 && (
                    <> / <b className="text-amber-700">未解析 {events.counts.unparsed}</b></>
                  )}
                  {events.counts.failed > 0 && (
                    <> / <b className="text-red-600">失敗 {events.counts.failed}</b></>
                  )}
                  {events.counts.rejected > 0 && (
                    <> / <b className="text-red-600">認証拒否 {events.counts.rejected}</b></>
                  )}
                  ）
                </span>
              </span>
              <span className="shrink-0 text-xs text-slate-500">
                {showEvents ? '閉じる ▲' : '履歴を開く ▼'}
              </span>
            </button>
            {/* 配信制御。GMO側の設定だけでは通知は始まらないので、ここから開始を要求する */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
              <span className="font-semibold text-slate-600">配信制御</span>
              <button
                type="button"
                disabled={notifyBusy !== ''}
                onClick={() => void controlSubscription(true)}
                className="rounded bg-blue-600 px-2 py-1 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {notifyBusy === 'subscribe' ? '要求中…' : '配信開始を要求'}
              </button>
              <button
                type="button"
                disabled={notifyBusy !== ''}
                onClick={() => void controlSubscription(false)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                {notifyBusy === 'unsubscribe' ? '要求中…' : '配信停止'}
              </button>
              <button
                type="button"
                disabled={notifyBusy !== ''}
                onClick={() => void collectUnsent()}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                {notifyBusy === 'unsent' ? '回収中…' : '未送信明細を回収して反映'}
              </button>
              <span className="text-[10px] text-slate-500">
                配信エラーが1時間続くと銀行側で自動停止します。停止中の明細は「回収」で取り込めますが、
                <b className="text-red-600">14日を過ぎると銀行側から削除され復旧できません</b>。
              </span>
            </div>

            {showEvents && (
              <div className="border-t border-slate-200 p-2">
                {events.rows.length === 0 ? (
                  <p className="px-1 py-2 text-[11px] text-slate-500">
                    まだ通知を受信していません。GMOのイベント通知設定に{' '}
                    <code className="rounded bg-slate-100 px-1">
                      {location.origin}/api/gmo/webhook
                    </code>{' '}
                    を登録してください。
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-2 py-1 text-left">受信日時</th>
                          <th className="px-2 py-1 text-left">状態</th>
                          <th className="px-2 py-1 text-right">明細</th>
                          <th className="px-2 py-1 text-right">反映</th>
                          <th className="px-2 py-1 text-left">内容</th>
                          <th className="px-2 py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.rows.map((r) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="whitespace-nowrap px-2 py-1 tabular-nums text-slate-600">
                              {r.receivedAt.slice(0, 16).replace('T', ' ')}
                            </td>
                            <td className="px-2 py-1">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] ${
                                  r.status === 'applied'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : r.status === 'failed' || r.status === 'rejected'
                                      ? 'bg-red-100 text-red-700'
                                      : r.status === 'unparsed'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {r.status === 'applied'
                                  ? '反映済'
                                  : r.status === 'no-target'
                                    ? '未突合'
                                    : r.status === 'unparsed'
                                      ? '未解析'
                                      : r.status === 'failed'
                                        ? '失敗'
                                        : r.status === 'rejected'
                                          ? '認証拒否'
                                          : r.status}
                              </span>
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">{r.parsedRows}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{r.reflected}</td>
                            <td className="px-2 py-1 text-slate-600">{r.message ?? '-'}</td>
                            <td className="px-2 py-1 text-right">
                              {r.status !== 'applied' && r.status !== 'rejected' && (
                                <button
                                  type="button"
                                  onClick={() => void reprocessEvent(r.id)}
                                  className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                                >
                                  再処理
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 要対応：弁済対象なのに支払条件・振込先が未入力（GMO対象から漏れる原因） */}
        {incomplete && incomplete.count > 0 && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 shadow-sm">
            <button
              type="button"
              onClick={() => setShowIncomplete((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="text-sm font-semibold text-amber-900">
                ⚠ 要対応：弁済対象なのに支払条件・振込先が未入力{' '}
                <b className="tabular-nums">{incomplete.count}</b> 件
                <span className="ml-2 text-xs font-normal text-amber-700">
                  （支払条件不足 {incomplete.scheduleMissingCount} / 振込先不足 {incomplete.accountMissingCount}
                  {incomplete.monthUnknownCount > 0 && (
                    <> / <b className="text-rose-700">支払開始日なし {incomplete.monthUnknownCount}</b></>
                  )}
                  ）
                </span>
              </span>
              <span className="shrink-0 text-xs text-amber-700">
                {showIncomplete ? '閉じる ▲' : '一覧を開く ▼'}
              </span>
            </button>
            {showIncomplete && (
              <div className="border-t border-amber-200 p-2">
                <p className="mb-2 px-1 text-[11px] text-amber-700">
                  弁済対象なのに支払条件（支払開始日・支払回数・金額）か振込先口座が未入力のため、GMO振込の対象にならない債権者です。行をクリックすると案件詳細を開いて入力できます。
                  <br />
                  対象は次の2種類です。
                  <b>①</b> {month} に支払いが必要（支払開始日 ≤ {month} ≤ 最終支払日）なもの。
                  <b className="text-rose-700">②「支払開始日なし」</b>
                  … 支払開始日が未入力で対象月を判定できず、このままでは
                  <b>どの月の振込にも一度も載りません</b>。月に関係なく常に表示します。
                </p>
                <div className="overflow-hidden rounded border border-amber-200 bg-white">
                  <DataTable
                    data={incomplete.rows}
                    columns={incompleteColumns}
                    keyField="creditorId"
                    density="compact"
                    paginated
                    onRowClick={(r) =>
                      navigate(`/cases/${r.caseId}`, {
                        state: { focusCreditorId: r.creditorId },
                      })
                    }
                    emptyMessage="未整備の弁済対象はありません"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <PageLoading message="対象を集計中…" />
        ) : !result ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            対象期間を指定して「プレビュー」してください。
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-slate-700">
                対象 <b>{result.count}</b> 件（出力 {outputCount} 件）
              </span>
              {result.incompleteCount > 0 && (
                <span className="text-red-600">口座情報不足 {result.incompleteCount} 件は出力から除外</span>
              )}
              {fileCount > 1 && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  GMOは1ファイル999件まで。{fileCount}ファイルに自動分割してZIPで一括出力します
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <DataTable
                data={rows}
                columns={columns}
                keyField="_i"
                density="compact"
                paginated
                csvExport="GMO振込一覧"
                onRowClick={(r) => navigate(`/cases/${r.caseId}`)}
                emptyMessage="対象となる振込はありません"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
