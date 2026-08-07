import { useEffect, useRef, useState } from 'react'

/**
 * 画面のどこにファイルを落としても受け取れるようにするフック。
 *
 * React の合成イベント（onDrop など）を1つの div に付ける方式だと、
 *   - ヘッダーやテーブルなど途中の要素でイベントが止まる
 *   - 画面の余白（その div の外側）に落とすと反応しない
 *   - dragover で preventDefault が呼ばれない経路があると drop 自体が発火しない
 * といった取りこぼしが起きる。ここでは window に直接ハンドラを付け、
 * ブラウザ既定の「ファイルを開いてページが差し替わる」動作もまとめて止める。
 *
 * @param onFiles ドロップされたファイル（複数可。先頭だけ使う画面が多い）
 * @param enabled false の間はドロップを受け付けない（処理中など）
 * @returns ドラッグ中かどうか（オーバーレイ表示用）
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled = true): boolean {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  // 最新のコールバック / 受付可否は ref 経由で参照する（リスナーを貼り直さないため）
  const cb = useRef(onFiles)
  const on = useRef(enabled)
  useEffect(() => {
    cb.current = onFiles
    on.current = enabled
  }, [onFiles, enabled])

  useEffect(() => {
    /** ファイルのドラッグかどうか（テキスト選択のドラッグ等では反応しない） */
    const hasFiles = (e: DragEvent): boolean => {
      const t = e.dataTransfer?.types
      if (!t) return false
      for (const x of Array.from(t as unknown as ArrayLike<string>)) {
        if (x === 'Files' || x === 'application/x-moz-file') return true
      }
      return false
    }

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      setDragging(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      // preventDefault を呼ばないと drop イベントが発火しない（ここが一番の要）
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      // dragenter/dragleave の数が合わなくなっても表示が戻るように保険
      if (!dragging) setDragging(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      // ファイル以外でも既定動作（ページ差し替え）は止める
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length > 0 && on.current) cb.current(files)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [dragging])

  return dragging
}
