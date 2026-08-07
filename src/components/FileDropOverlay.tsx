/**
 * ファイルをドラッグ中に画面全体へ出す案内。
 * pointer-events-none にして、ドロップ自体は下の window ハンドラが受け取る。
 */
export function FileDropOverlay({ show, accept }: { show: boolean; accept: string }) {
  if (!show) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40">
      <div className="rounded-2xl border-4 border-dashed border-white bg-slate-900/70 px-10 py-8 text-center text-white">
        <p className="text-lg font-bold">ここにドロップして取り込む</p>
        <p className="mt-1 text-sm opacity-90">{accept}</p>
      </div>
    </div>
  )
}
