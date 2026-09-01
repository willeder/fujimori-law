/**
 * 受任資料（案件詳細の「受任資料」タブ）。
 *
 * 以前はモックデータ3件がハードコードされたままで、事務所から
 * 「入れてもいないデータが3つ勝手に入る」とご指摘をいただいた（修正依頼⑪）。
 * さらにアップロードしても保存されず、再読み込みで消える状態だった。
 * Supabase Storage を使って実際に保存されるように作り直したもの。
 *
 * 送信経路:
 *   ①サーバに署名付きアップロードURLをもらう
 *   ②ブラウザから Storage へ直接送る（アプリのサーバを経由しない）
 *   ③送り終わったらサーバに知らせて記録する
 * ②で直送するのは、サーバ経由だと本文4.5MBの上限に引っかかり、
 * マイナンバーカードの写真が送れないため。
 *
 * 区分は「マイナンバーカード（表）／（裏）」をやめ、事務所のご要望どおり
 * 「身分証明書」1つにまとめている（裏面は不要とのこと）。
 *
 * kintone から移した「相談票添付」「和解ファイル」もこの1か所に出す。
 * 別セクションに分けると同じ「資料を探す」動作の入口が2つになって迷うため、
 * 区分の違いとして並べ、絞り込みで切り替えられるようにしている。
 * kintone由来の分は移行元の記録なので、この画面からは消せない。
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'

const CATEGORIES = [
  '身分証明書',
  '委任状',
  '和解書',
  '債権調査票',
  '受任通知書',
  'その他書類',
] as const
type FileCategory = (typeof CATEGORIES)[number]

const CATEGORY_COLORS: Record<string, string> = {
  相談票添付: 'bg-teal-100 text-teal-700',
  和解ファイル: 'bg-cyan-100 text-cyan-700',
  身分証明書: 'bg-indigo-100 text-indigo-700',
  委任状: 'bg-amber-100 text-amber-700',
  和解書: 'bg-green-100 text-green-700',
  債権調査票: 'bg-blue-100 text-blue-700',
  受任通知書: 'bg-slate-100 text-slate-600',
  その他書類: 'bg-gray-100 text-gray-600',
}

/** 画面から入れた資料の field 値。kintone由来のものと区別する */
const UPLOAD_FIELD = '受任資料'
/** kintone から移した分。区分としてそのまま並べる（削除はさせない） */
const KINTONE_FIELDS = ['相談票添付', '和解ファイル'] as const
const MAX_BYTES = 100 * 1024 * 1024
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'pdf', 'docx', 'doc', 'xlsx', 'xls']

type CaseFile = {
  id: number
  caseId: number
  field: string
  category: string | null
  name: string
  mime: string
  size: number
  uploadedBy: string
  createdAt: string
}

const fmtSize = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
const fmtDate = (iso: string) => iso.slice(0, 16).replace('T', ' ')
const opensInBrowser = (mime: string) => mime.startsWith('image/') || mime === 'application/pdf'

export function SettlementFiles({ caseId }: { caseId?: number }) {
  const [files, setFiles] = useState<CaseFile[]>([])
  const [category, setCategory] = useState<FileCategory>('身分証明書')
  const [filter, setFilter] = useState<string>('すべて')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    if (!caseId) return
    fetch(`/api/cases/${caseId}/files`)
      .then((r) => (r.ok ? (r.json() as Promise<CaseFile[]>) : null))
      .then((d) => {
        // kintone由来（相談票添付・和解ファイル）も画面から入れた分も、まとめてここに出す
        if (d) setFiles(d)
      })
      .catch(() => {
        /* 次回の再取得で回復 */
      })
  }, [caseId])

  useEffect(load, [load])

  const uploadOne = async (file: File) => {
    if (!caseId) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXT.includes(ext)) throw new Error(`${file.name}: 対応していない形式です`)
    if (file.size > MAX_BYTES)
      throw new Error(`${file.name}: 大きすぎます（上限 ${MAX_BYTES / 1024 / 1024}MB）`)

    const signRes = await fetch(`/api/cases/${caseId}/files/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, mime: file.type, size: file.size, category }),
    })
    const sign = (await signRes.json()) as { uploadUrl?: string; storagePath?: string; error?: string }
    if (!signRes.ok || !sign.uploadUrl || !sign.storagePath)
      throw new Error(sign.error ?? 'アップロードの準備に失敗しました')

    const put = await fetch(sign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!put.ok) throw new Error(`${file.name}: 送信に失敗しました (${put.status})`)

    const recRes = await fetch(`/api/cases/${caseId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        mime: file.type,
        category,
        storagePath: sign.storagePath,
      }),
    })
    const rec = (await recRes.json()) as { file?: CaseFile; error?: string }
    if (!recRes.ok || !rec.file) throw new Error(rec.error ?? '記録に失敗しました')
    setFiles((prev) => [...prev, rec.file!])
  }

  const addFiles = async (list: File[]) => {
    setError(null)
    for (const f of list) {
      setBusy(f.name)
      try {
        await uploadOne(f)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    }
  }

  const open = async (f: CaseFile) => {
    setError(null)
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
    }
  }

  const remove = async (f: CaseFile) => {
    if (!window.confirm(`「${f.name}」を削除しますか？`)) return
    setError(null)
    const r = await fetch(`/api/cases/files/${f.id}`, { method: 'DELETE' }).catch(() => null)
    if (!r || !r.ok) {
      const d = r ? ((await r.json().catch(() => ({}))) as { error?: string }) : null
      setError(d?.error ?? '削除に失敗しました')
      load()
      return
    }
    setFiles((prev) => prev.filter((x) => x.id !== f.id))
  }

  /** 表示上の区分。kintone由来は field（相談票添付・和解ファイル）をそのまま区分として扱う */
  const groupOf = (f: CaseFile) => f.category ?? f.field
  /** 絞り込みに出す区分。実際に持っているものと、これから入れられるものを合わせる */
  const groups = [
    ...KINTONE_FIELDS.filter((k) => files.some((f) => groupOf(f) === k)),
    ...CATEGORIES,
  ]
  const shown = filter === 'すべて' ? files : files.filter((f) => groupOf(f) === filter)

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    void addFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <div className="space-y-3 p-2">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-500">区分</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as FileCategory)}
          className="rounded border border-slate-300 px-2 py-1 text-xs"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!caseId || busy != null}
          className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600 disabled:bg-slate-300"
        >
          ファイルを選ぶ
        </button>
        {busy && <span className="text-xs text-slate-500">送信中… {busy}</span>}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded border-2 border-dashed px-3 py-4 text-center text-xs ${
          dragging ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-400'
        }`}
      >
        ここにドラッグしても入れられます（画像・PDF・Word・Excel、1ファイル100MBまで）
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {['すべて', ...groups].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`rounded border px-2 py-0.5 text-[0.6875rem] ${
              filter === c
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {c}
            <span className="ml-1 text-[0.625rem] opacity-70">
              {c === 'すべて' ? files.length : files.filter((f) => groupOf(f) === c).length}
            </span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="p-2 text-xs text-slate-400">まだ資料がありません</div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded border border-slate-200">
          {shown.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-2 py-1">
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] ${
                  CATEGORY_COLORS[groupOf(f)] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {groupOf(f)}
              </span>
              <button
                type="button"
                onClick={() => void open(f)}
                className="min-w-0 flex-1 truncate text-left text-xs text-blue-600 hover:underline"
                title={f.name}
              >
                {f.name}
              </button>
              <span className="shrink-0 text-[0.625rem] tabular-nums text-slate-400">
                {fmtSize(f.size)}
              </span>
              <span className="hidden shrink-0 text-[0.625rem] text-slate-400 sm:inline">
                {fmtDate(f.createdAt)}
              </span>
              {f.field === UPLOAD_FIELD ? (
                <button
                  type="button"
                  onClick={() => void remove(f)}
                  className="shrink-0 text-[0.625rem] text-slate-400 hover:text-red-600"
                >
                  削除
                </button>
              ) : (
                // kintone から移した分は移行元の記録なので消させない
                <span
                  className="shrink-0 text-[0.625rem] text-slate-300"
                  title="kintoneから移行した資料です。この画面からは削除できません"
                >
                  移行分
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[0.6875rem] leading-snug text-slate-400">
        kintone から移した「相談票添付」「和解ファイル」もここに出しています（区分で絞り込めます）。
        移行分は記録として残すため、この画面からは削除できません。
      </p>
    </div>
  )
}
