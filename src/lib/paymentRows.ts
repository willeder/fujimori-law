/**
 * 入金スケジュールの行の分類。
 *
 * kintone の入金情報サブテーブルには、明細のほかに「合計だけが入った行」が
 * 混ざっている。画面ではこれを出したくないが、判定を各画面で書くと食い違うので
 * ここに集約する。
 *
 * ★注意（実際に起きた不具合）
 *   以前は「入金予定日が無い行＝合計行」として除外していた。しかし実運用では
 *   **入金予定日が無く実入金日だけある行**（予定外の入金・臨時のプール入金）が
 *   普通に存在する。その結果、302行・205案件・約1,301万円 の実入金が
 *   画面から丸ごと消えていた（93522E の 2026-05-18 / 05-21 の各100万円など）。
 *   合計行とみなすのは「予定日も実入金日も両方無い行」だけにすること。
 */
import type { PaymentRecord } from '../types'

/**
 * 中身が何も無い行か（kintone のサブテーブルに残っていた空行）。
 *
 * 判定は「日付が両方とも無く、金額も予定・実績とも入っていない」こと。
 * ここを「入金予定日が無い行」だけで判定すると、
 *   ・実入金だけある行（予定外入金）が消える
 *   ・追加した直後の行が即座に消えて「追加できない」ように見える
 * という不具合になる。実際に両方とも起きた。
 */
export function isEmptyRow(
  p: Pick<PaymentRecord, 'plannedDate' | 'actualDate' | 'plannedAmount' | 'actualAmount'>
): boolean {
  return (
    p.plannedDate == null &&
    p.actualDate == null &&
    (p.plannedAmount == null || p.plannedAmount === 0) &&
    (p.actualAmount == null || p.actualAmount === 0)
  )
}

/** 表示対象の行か（空行だけを除く） */
export function isVisibleRow(
  p: Pick<PaymentRecord, 'plannedDate' | 'actualDate' | 'plannedAmount' | 'actualAmount'>
): boolean {
  return !isEmptyRow(p)
}

/**
 * 「入金予定を追加」で使う既定の入金予定日。
 * 空のまま作ると空行と判定されて画面に出ないため、必ず日付を入れる。
 * 直近の予定日の翌月同日、予定が無ければ当日。
 */
export function nextPlannedDate(rows: Pick<PaymentRecord, 'plannedDate'>[]): string {
  const dates = rows
    .map((r) => r.plannedDate)
    .filter((d): d is string => !!d)
    .sort()
  const base = dates[dates.length - 1]
  const d = base ? new Date(`${base}T00:00:00Z`) : new Date()
  if (base) {
    const day = d.getUTCDate()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() + 1)
    // 月末開始（31日など）は翌月の末日に丸める
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, last))
  }
  return d.toISOString().slice(0, 10)
}
