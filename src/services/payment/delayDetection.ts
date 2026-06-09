import type { PaymentRecord, PaymentDelayStats } from '../../types/case'

/**
 * 入金遅延検知サービス
 *
 * 入金予定と実績を比較して遅延を検知し、
 * リスクレベルを判定する
 */

/**
 * 入金遅延を検知
 *
 * @param payments - 入金予定/実績のリスト
 * @returns 遅延している入金のリスト
 */
export function detectPaymentDelays(payments: PaymentRecord[]): PaymentRecord[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return payments
    .filter(payment => {
      // 予定日がない場合はスキップ
      if (!payment.plannedDate) return false

      // 既に入金済みの場合はスキップ
      if (payment.actualDate) return false

      // 予定日を過ぎているかチェック
      const plannedDate = new Date(payment.plannedDate)
      plannedDate.setHours(0, 0, 0, 0)

      return plannedDate < today
    })
    .map(payment => {
      const plannedDate = new Date(payment.plannedDate!)
      plannedDate.setHours(0, 0, 0, 0)

      // 遅延日数を計算
      const delayDays = Math.floor(
        (today.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      return {
        ...payment,
        delayDays,
        isDelayed: true
      }
    })
}

/**
 * 入金遅延統計を計算
 *
 * @param caseId - 案件ID
 * @param payments - 入金予定/実績のリスト
 * @returns 遅延統計
 */
export function calculateDelayStats(
  caseId: number,
  payments: PaymentRecord[]
): PaymentDelayStats {
  // 案件に紐づく入金のみ抽出
  const casePayments = payments.filter(p => p.caseId === caseId)

  // 実績がある入金のみカウント
  const completedPayments = casePayments.filter(p => p.actualDate && p.plannedDate)
  const totalPayments = completedPayments.length

  // 遅延した入金をカウント
  const delayedPayments = completedPayments.filter(payment => {
    const plannedDate = new Date(payment.plannedDate!)
    const actualDate = new Date(payment.actualDate!)
    return actualDate > plannedDate
  })

  const delayCount = delayedPayments.length
  const delayRate = totalPayments > 0 ? delayCount / totalPayments : 0

  // 連続遅延回数を計算
  const consecutiveDelays = calculateConsecutiveDelays(casePayments)

  // 最後の遅延日
  const lastDelayDate = delayedPayments.length > 0
    ? delayedPayments
        .sort((a, b) =>
          new Date(b.actualDate!).getTime() - new Date(a.actualDate!).getTime()
        )[0].actualDate
    : null

  // 平均遅延日数を計算
  const avgDelayDays = calculateAverageDelayDays(delayedPayments)

  // リスクレベル判定
  const riskLevel = determineRiskLevel(delayRate, consecutiveDelays)

  return {
    caseId,
    totalPayments,
    delayedPayments: delayCount,
    delayRate,
    consecutiveDelays,
    lastDelayDate,
    riskLevel,
    avgDelayDays
  }
}

/**
 * 連続遅延回数を計算
 *
 * @param payments - 入金予定/実績のリスト
 * @returns 連続遅延回数
 */
function calculateConsecutiveDelays(payments: PaymentRecord[]): number {
  // 日付順にソート（新しい順）
  const sorted = [...payments]
    .filter(p => p.actualDate && p.plannedDate)
    .sort((a, b) =>
      new Date(b.actualDate!).getTime() - new Date(a.actualDate!).getTime()
    )

  let consecutive = 0

  for (const payment of sorted) {
    const plannedDate = new Date(payment.plannedDate!)
    const actualDate = new Date(payment.actualDate!)

    const isDelayed = actualDate > plannedDate

    if (isDelayed) {
      consecutive++
    } else {
      break // 連続が途切れた
    }
  }

  return consecutive
}

/**
 * 平均遅延日数を計算
 *
 * @param delayedPayments - 遅延した入金のリスト
 * @returns 平均遅延日数
 */
function calculateAverageDelayDays(delayedPayments: PaymentRecord[]): number {
  if (delayedPayments.length === 0) return 0

  const totalDelayDays = delayedPayments.reduce((sum, payment) => {
    const plannedDate = new Date(payment.plannedDate!)
    const actualDate = new Date(payment.actualDate!)
    const delayDays = Math.floor(
      (actualDate.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    return sum + delayDays
  }, 0)

  return Math.round(totalDelayDays / delayedPayments.length)
}

/**
 * リスクレベル判定
 *
 * 判定基準:
 * - 高リスク: 連続3回以上遅延 OR 遅延率50%以上
 * - 中リスク: 連続2回遅延 OR 遅延率30%以上
 * - 低リスク: 上記以外
 *
 * @param delayRate - 遅延率 (0-1)
 * @param consecutiveDelays - 連続遅延回数
 * @returns リスクレベル
 */
export function determineRiskLevel(
  delayRate: number,
  consecutiveDelays: number
): 'low' | 'medium' | 'high' {
  // 連続3回以上遅延 or 遅延率50%以上 → 高リスク
  if (consecutiveDelays >= 3 || delayRate >= 0.5) {
    return 'high'
  }

  // 連続2回遅延 or 遅延率30%以上 → 中リスク
  if (consecutiveDelays >= 2 || delayRate >= 0.3) {
    return 'medium'
  }

  return 'low'
}

/**
 * 今後の入金予定を取得（30日以内）
 *
 * @param payments - 入金予定/実績のリスト
 * @returns 今後30日以内の入金予定
 */
export function getUpcomingPayments(payments: PaymentRecord[]): PaymentRecord[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const futureDate = new Date(today)
  futureDate.setDate(today.getDate() + 30)

  return payments.filter(payment => {
    if (!payment.plannedDate) return false
    if (payment.actualDate) return false // 既に入金済み

    const plannedDate = new Date(payment.plannedDate)
    plannedDate.setHours(0, 0, 0, 0)

    return plannedDate >= today && plannedDate <= futureDate
  })
}

/**
 * 支払日までの残り日数を計算
 *
 * @param plannedDate - 入金予定日
 * @returns 残り日数
 */
export function calculateDaysUntilPayment(plannedDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const paymentDate = new Date(plannedDate)
  paymentDate.setHours(0, 0, 0, 0)

  return Math.ceil(
    (paymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )
}
