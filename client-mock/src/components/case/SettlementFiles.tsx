/**
 * 和解ファイル管理コンポーネント
 * マイナンバーカード写真・委任状・和解書などをアップロード・管理する
 */
import { useState, useRef, useCallback, type DragEvent } from 'react'

type FileCategory =
  | 'マイナンバーカード（表）'
  | 'マイナンバーカード（裏）'
  | '委任状'
  | '和解書'
  | '債権調査票'
  | '受任通知書'
  | 'その他書類'

const CATEGORIES: FileCategory[] = [
  'マイナンバーカード（表）',
  'マイナンバーカード（裏）',
  '委任状',
  '和解書',
  '債権調査票',
  '受任通知書',
  'その他書類',
]

const CATEGORY_COLORS: Record<FileCategory, string> = {
  'マイナンバーカード（表）': 'bg-indigo-100 text-indigo-700',
  'マイナンバーカード（裏）': 'bg-purple-100 text-purple-700',
  '委任状': 'bg-amber-100 text-amber-700',
  '和解書': 'bg-green-100 text-green-700',
  '債権調査票': 'bg-blue-100 text-blue-700',
  '受任通知書': 'bg-slate-100 text-slate-600',
  'その他書類': 'bg-gray-100 text-gray-600',
}

interface UploadedFile {
  id: string
  name: string
  type: 'image' | 'pdf'
  category: FileCategory
  uploadedAt: string
  size: string
}

// モック用の初期ファイル
const MOCK_FILES: UploadedFile[] = [
  {
    id: '1',
    name: 'マイナンバーカード_表.jpg',
    type: 'image',
    category: 'マイナンバーカード（表）',
    uploadedAt: '2024/03/01 10:30',
    size: '1.2 MB',
  },
  {
    id: '2',
    name: '委任状.pdf',
    type: 'pdf',
    category: '委任状',
    uploadedAt: '2024/03/02 14:15',
    size: '245 KB',
  },
  {
    id: '3',
    name: '和解書_楽天カード.pdf',
    type: 'pdf',
    category: '和解書',
    uploadedAt: '2024/04/10 09:00',
    size: '512 KB',
  },
]

interface SettlementFilesProps {
  caseId?: number
}

export function SettlementFiles({ caseId }: SettlementFilesProps) {
  const [files, setFiles] = useState<UploadedFile[]>(MOCK_FILES)
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>(
    'マイナンバーカード（表）'
  )
  const [filterCategory, setFilterCategory] = useState<FileCategory | 'すべて'>('すべて')
  const [isDragging, setIsDragging] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formatDate = () => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return (
      `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}`
    )
  }

  const addFiles = useCallback(
    (newFiles: File[]) => {
      const valid = newFiles.filter((f) => {
        const ext = f.name.split('.').pop()?.toLowerCase()
        return ['jpg', 'jpeg', 'png', 'pdf'].includes(ext ?? '')
      })
      const uploaded: UploadedFile[] = valid.map((f) => ({
        id: `${Date.now()}-${Math.random()}`,
        name: f.name,
        type: f.type.startsWith('image') ? 'image' : 'pdf',
        category: selectedCategory,
        uploadedAt: formatDate(),
        size:
          f.size > 1024 * 1024
            ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
            : `${Math.round(f.size / 1024)} KB`,
      }))
      setFiles((prev) => [...uploaded, ...prev])
    },
    [selectedCategory]
  )

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      addFiles(Array.from(e.dataTransfer.files))
    },
    [addFiles]
  )

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files))
      e.target.value = ''
    }
  }

  const handleDelete = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
    setDeleteConfirm(null)
  }

  // マイナンバーカード表裏の確認
  const hasMNFront = files.some((f) => f.category === 'マイナンバーカード（表）')
  const hasMNBack = files.some((f) => f.category === 'マイナンバーカード（裏）')
  const mnCardIncomplete = (hasMNFront || hasMNBack) && !(hasMNFront && hasMNBack)

  const filteredFiles =
    filterCategory === 'すべて' ? files : files.filter((f) => f.category === filterCategory)

  return (
    <div className="space-y-4">
      {caseId != null && (
        <div className="text-xs text-slate-500">案件ID: {caseId}</div>
      )}
      {/* マイナンバーカード表裏未揃い警告 */}
      {mnCardIncomplete && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.538-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          マイナンバーカードの表・裏どちらかがアップロードされていません
        </div>
      )}

      {/* アップロードゾーン */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-slate-300 hover:border-slate-400 bg-slate-50'
        }`}
      >
        <div className="text-3xl mb-2">📂</div>
        <p className="text-sm text-slate-600 mb-1">
          ファイルをここにドラッグ＆ドロップ
        </p>
        <p className="text-xs text-slate-400 mb-4">
          対応形式：JPG・PNG・PDF 最大ファイルサイズ：20MB
        </p>

        {/* カテゴリ選択 */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <label className="text-xs text-slate-500 whitespace-nowrap">書類カテゴリ</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as FileCategory)}
            className="text-sm border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-400"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
        >
          ファイルを選択
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* カテゴリ絞り込みフィルター */}
      {files.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-500 mr-1">絞り込み:</span>
          <button
            onClick={() => setFilterCategory('すべて')}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              filterCategory === 'すべて'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            すべて（{files.length}）
          </button>
          {CATEGORIES.map((cat) => {
            const count = files.filter((f) => f.category === cat).length
            if (count === 0) return null
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  filterCategory === cat
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}（{count}）
              </button>
            )
          })}
        </div>
      )}

      {/* ファイル一覧 */}
      {filteredFiles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">
          {files.length === 0
            ? 'ファイルがまだアップロードされていません'
            : '該当するファイルがありません'}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
            >
              <span className="text-xl flex-shrink-0">
                {file.type === 'image' ? '🖼️' : '📄'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-700 whitespace-normal break-all">
                    {file.name}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[file.category]}`}
                  >
                    {file.category}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {file.uploadedAt} · {file.size}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* プレビューボタン */}
                <button
                  className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                  title="プレビュー"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                </button>

                {/* 削除ボタン / 確認 */}
                {deleteConfirm === file.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      削除
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                    >
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(file.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="削除"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
