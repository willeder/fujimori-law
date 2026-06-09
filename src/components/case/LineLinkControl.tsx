import { useEffect, useRef, useState } from 'react'

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

/** 友だち追加URL（公式アカウント固有・全案件共通）。client-mock/.env の VITE_LINE_ADD_FRIEND_URL で設定 */
const ADD_FRIEND_URL =
  import.meta.env.VITE_LINE_ADD_FRIEND_URL || 'https://lin.ee/xxxxxxx'

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
  const [copied, setCopied] = useState(false)
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

  const issue = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/line/links/${caseId}`, { method: 'POST' })
      setLink((await res.json()) as LineLink)
    } finally {
      setBusy(false)
    }
  }

  const guidanceText = (code: string) =>
    `【ご案内】LINEで手続き状況や入金予定をお知らせします。\n\n①下記から友だち追加してください\n${ADD_FRIEND_URL}\n\n②追加後、トークに次のコードを送信してください\n${code}`

  const copyGuidance = async () => {
    if (!link?.registrationCode) return
    await navigator.clipboard.writeText(guidanceText(link.registrationCode))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
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
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${meta.cls}`}>
          {meta.label}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              LINE連携 {clientName ? `（${clientName} 様）` : ''}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${meta.cls}`}>
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
                  <div className="text-[10px] text-slate-500">登録コード</div>
                  <div className="font-mono text-base font-bold tracking-widest text-slate-800">
                    {code}
                  </div>
                </div>
              )}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={issue}
                  disabled={busy}
                  className="flex-1 rounded bg-[#06C755] px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? '発行中…' : code ? 'コードを再発行' : '登録コードを発行'}
                </button>
                {code && (
                  <button
                    type="button"
                    onClick={copyGuidance}
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {copied ? 'コピーしました' : '案内文をコピー'}
                  </button>
                )}
              </div>
              <p className="mt-2 text-[10px] leading-snug text-slate-400">
                「案内文をコピー」で、友だち追加URL＋コードの依頼文がそのままコピーされます。依頼者へメール/SMS等で送付してください。
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
