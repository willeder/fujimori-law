import { useEffect, useRef, useState } from 'react'
import { buildGuidance } from '../../constants/lineGuidance'

interface LineLink {
  status: 'NONE' | 'PENDING' | 'LINKED' | 'BLOCKED'
  registrationCode?: string | null
  lineUserId?: string | null
  codeExpiresAt?: string | null
  linkedAt?: string | null
}

interface Props {
  caseId: number
  clientName: string | null
}


const STATUS_META: Record<
  LineLink['status'],
  { label: string; cls: string }
> = {
  NONE: { label: '未連携', cls: 'bg-slate-100 text-slate-600' },
  PENDING: { label: 'コード発行済', cls: 'bg-amber-100 text-amber-800' },
  LINKED: { label: '連携済み', cls: 'bg-green-100 text-green-800' },
  BLOCKED: { label: 'ブロック', cls: 'bg-red-100 text-red-700' },
}

export function LineLinkControl({ caseId, clientName }: Props) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState<LineLink | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<'guide' | 'code' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      const res = await fetch(`/api/line/links/${caseId}`)
      setLink((await res.json()) as LineLink)
    } catch {
      setLink({ status: 'NONE' })
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // force=false: 既存コードがあればそのまま返す（冪等）。force=true: 新コードを再発行
  const issue = async (force = false) => {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/line/links/${caseId}${force ? '?force=1' : ''}`,
        { method: 'POST' }
      )
      setLink((await res.json()) as LineLink)
    } finally {
      setBusy(false)
    }
  }

  const reissue = () => {
    if (
      window.confirm(
        '現在のコードは無効になります。依頼者には新しいコードを送り直す必要があります。再発行しますか？'
      )
    ) {
      void issue(true)
    }
  }

  /**
   * 依頼者へ送る案内文。文面は src/constants/lineGuidance.ts に一本化しており、
   * Webhook 側も同じ定義で全文一致を判定する。
   */
  const guidanceText = () =>
    link?.registrationCode ? buildGuidance(link.registrationCode) : ''

  const copyGuidance = async () => {
    await navigator.clipboard.writeText(guidanceText())
    setCopied('guide')
    setTimeout(() => setCopied(null), 1500)
  }

  const copyCode = async () => {
    if (!link?.registrationCode) return
    await navigator.clipboard.writeText(link.registrationCode)
    setCopied('code')
    setTimeout(() => setCopied(null), 1500)
  }

  const status = link?.status ?? 'NONE'
  const meta = STATUS_META[status]
  const code = link?.registrationCode

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        LINE連携
        <span className={`rounded px-1.5 py-0.5 text-[0.625rem] ${meta.cls}`}>
          {meta.label}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              LINE連携 {clientName ? `（${clientName} 様）` : ''}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[0.625rem] ${meta.cls}`}>
              {meta.label}
            </span>
          </div>

          {status === 'LINKED' ? (
            <p className="text-xs text-green-700">
              連携済みです。
              {link?.linkedAt
                ? `（${String(link.linkedAt).slice(0, 10)}）`
                : ''}
            </p>
          ) : (
            <>
              {code && (
                <div className="mb-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-[0.625rem] text-slate-500">登録コード</div>
                  <div className="font-mono text-base font-bold tracking-widest text-slate-800">
                    {code}
                  </div>
                </div>
              )}
              {!code ? (
                <button
                  type="button"
                  onClick={() => void issue(false)}
                  disabled={busy}
                  className="w-full rounded bg-[#06C755] px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? '発行中…' : '登録コードを発行'}
                </button>
              ) : (
                <>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={copyGuidance}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {copied === 'guide' ? 'コピーしました' : '案内文をコピー'}
                    </button>
                    <button
                      type="button"
                      onClick={copyCode}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {copied === 'code' ? 'コピーしました' : 'コードをコピー'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={reissue}
                    disabled={busy}
                    className="mt-1.5 w-full text-[0.6875rem] text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
                  >
                    {busy ? '処理中…' : 'コードを再発行（現在のコードは無効になります）'}
                  </button>
                </>
              )}
              <p className="mt-2 text-[0.625rem] leading-snug text-slate-400">
                「案内文をコピー」の1通を送ってください。依頼者が
                <b>その全文をそのまま返信すると自動で連携</b>されます。
                文面を書き換えると一致しなくなるのでご注意ください。
                コードは一度発行すると固定です（再発行すると旧コードは使えなくなります）。
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
