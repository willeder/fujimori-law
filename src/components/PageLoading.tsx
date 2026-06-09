/**
 * ページ本文のローディング表示（スピナー＋メッセージ）。
 * データ取得中に本文領域へ表示する。
 */
export function PageLoading({ message = '読み込み中…' }: { message?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
