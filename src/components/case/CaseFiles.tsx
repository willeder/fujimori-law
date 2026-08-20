/**
 * 案件の添付ファイル（kintone の「相談票添付」「和解ファイル」）。
 *
 * 実体は Supabase Storage にあり、この画面はサーバに署名付きURLを発行させて
 * ブラウザから直接取りに行く。26.3GB あるためアプリのサーバは経由しない。
 * 署名URLの期限は10分（発行のたびに監査ログへ「誰が何を開いたか」を残す）。
 */
import { useCallback, useEffect, useState } from 'react'

type CaseFileMeta = {
  id: number
  caseId: number
  field: string
  name: string
  mime: string
  size: number
  uploadedBy: string
  createdAt: string
}

const fmtSize = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`

/** 画像とPDFは新しいタブで開く。それ以外は保存させる */
const opensInBrowser = (mime: string) => mime.startsWith('image/') || mime === 'application/pdf'

export function CaseFiles({ caseId }: { caseId: number }) {
  const [files, setFiles] = useState<CaseFileMeta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(() => {
    fetch(`/api/cases/${caseId}/files`)
      .then((r) => (r.ok ? (r.json() as Promise<CaseFileMeta[]>) : null))
      .then((d) => {
        if (d) setFiles(d)
      })
      .catch(() => {
        /* 次回の再取得で回復 */
      })
  }, [caseId])

  useEffect(load, [load])

  const open = async (f: CaseFileMeta) => {
    setBusyId(f.id)
    setError(null)
    // ポップアップブロックを避けるため、URL取得前に空タブを開いておく
    const inline = opensInBrowser(f.mime)
    const tab = inline ? window.open('', '_blank') : null
    try {
      const r = await fetch(`/api/cases/files/${f.id}/url${inline ? '' : '?download=1'}`)
      const d = (await r.json()) as { url?: string; error?: string }
      if (!r.ok || !d.url) throw new Error(d.error ?? 'ファイルを開けませんでした')
      if (tab) tab.location.replace(d.url)
      else window.location.assign(d.url)
    } catch (e) {
      tab?.close()
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const groups = ['相談票添付', '和解ファイル'].filter((g) => files.some((f) => f.field === g))
  const others = files.filter((f) => !groups.includes(f.field))

  if (files.length === 0) {
    return <div className="p-2 text-xs text-slate-400">添付ファイルはありません</div>
  }

  const renderGroup = (label: string, rows: CaseFileMeta[]) => (
    <div key={label} className="space-y-1">
      <div className="text-xs font-medium text-slate-500">
        {label}
        <span className="ml-1 text-slate-400">（{rows.length}件）</span>
      </div>
      <ul className="divide-y divide-slate-100 rounded border border-slate-200">
        {rows.map((f) => (
          <li key={f.id} className="flex items-center gap-2 px-2 py-1">
            <button
              type="button"
              onClick={() => void open(f)}
              disabled={busyId === f.id}
              className="min-w-0 flex-1 truncate text-left text-xs text-blue-600 hover:underline disabled:text-slate-400"
              title={f.name}
            >
              {f.name}
            </button>
            <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{fmtSize(f.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="space-y-2 p-2">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      )}
      {groups.map((g) => renderGroup(g, files.filter((f) => f.field === g)))}
      {others.length > 0 && renderGroup('その他', others)}
    </div>
  )
}
