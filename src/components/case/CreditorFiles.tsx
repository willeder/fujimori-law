/**
 * 債権者資料（和解状況の各社タブ内のファイル格納フィールド）。No.8
 * 和解書・債権調査票・受任通知の控えなど、その債権者に紐づく資料を
 * アップロード（DB保存）・ダウンロード・削除できる。1ファイル4MBまで。
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'

type FileMeta = {
  id: number
  creditorId: number
  name: string
  mime: string
  size: number
  uploadedBy: string
  createdAt: string
}

const MAX_BYTES = 4 * 1024 * 1024

const fmtSize = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`

const fmtDate = (iso: string) => iso.slice(0, 16).replace('T', ' ')

export function CreditorFiles({ creditorId }: { creditorId: number }) {
  const [files, setFiles] = useState<FileMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch(`/api/creditors/${creditorId}/files`)
      .then((r) => (r.ok ? (r.json() as Promise<FileMeta[]>) : null))
      .then((d) => {
        if (d) setFiles(d)
      })
      .catch(() => {
        /* 次回の再取得で回復 */
      })
  }, [creditorId])

  useEffect(() => {
    load()
  }, [load])

  const upload = async (fileList: FileList | File[]) => {
    setError(null)
    for (const f of Array.from(fileList)) {
      if (f.size > MAX_BYTES) {
        setError(`「${f.name}」は4MBを超えているためアップロードできません`)
        continue
      }
      setBusy(true)
      try {
        const buf = await f.arrayBuffer()
        let bin = ''
        const bytes = new Uint8Array(buf)
        const chunk = 0x8000
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
        }
        const r = await fetch(`/api/creditors/${creditorId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: f.name,
            mime: f.type || 'application/octet-stream',
            dataBase64: btoa(bin),
          }),
        })
        const body = (await r.json()) as { ok?: boolean; error?: string; file?: FileMeta }
        if (!r.ok || !body.ok) {
          setError(body.error ?? `アップロードに失敗しました（HTTP ${r.status}）`)
        } else if (body.file) {
          setFiles((prev) => [...prev, body.file!])
        }
      } catch (e) {
        setError(`アップロードに失敗しました: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setBusy(false)
      }
    }
  }

  const remove = async (f: FileMeta) => {
    if (!window.confirm(`「${f.name}」を削除しますか？`)) return
    try {
      const r = await fetch(`/api/creditors/files/${f.id}`, { method: 'DELETE' })
      if (r.ok) setFiles((prev) => prev.filter((x) => x.id !== f.id))
    } catch {
      /* noop */
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files)
  }

  return (
    <div className="col-span-5 mt-1 border-t border-slate-100 pt-1">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-semibold text-slate-400">債権者資料</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          {busy ? 'アップロード中…' : '＋ ファイル追加'}
        </button>
        <span className="text-[9px] text-slate-400">（1ファイル4MBまで・ドラッグ&ドロップ可）</span>
      </div>
      {error && <div className="mb-1 text-[10px] text-red-600">{error}</div>}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded border px-2 py-1 ${
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-dashed border-slate-200 bg-slate-50/50'
        }`}
      >
        {files.length === 0 ? (
          <div className="py-1 text-center text-[10px] text-slate-400">
            資料はまだありません（ここにファイルをドロップしても追加できます）
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-0.5 text-[11px]">
                <a
                  href={`/api/creditors/files/${f.id}`}
                  className="min-w-0 flex-1 truncate text-blue-600 hover:underline"
                  title={f.name}
                >
                  {f.name}
                </a>
                <span className="shrink-0 text-[10px] text-slate-400">{fmtSize(f.size)}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{fmtDate(f.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => void remove(f)}
                  className="shrink-0 rounded px-1 text-[10px] text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="削除"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
