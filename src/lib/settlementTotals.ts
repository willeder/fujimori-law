/**
 * 和解状況の集計（和解弁済総数・和解後代弁社数・予定弁済総数・予定代弁社数）。
 *
 * kintone ではこの4項目が手入力だったが、債権者データから機械的に出せるため
 * 表示のたびに計算する方式へ切り替えた。DBの値は書き換えず、画面では
 * 計算値を出す（元の手入力値は監査・履歴用に列としては残している）。
 *
 * 事務所と確認した定義:
 *   ・弁済対象      … 「受任対象外」でなく、かつ弁済対象が「停止」「終了」でない債権者
 *   ・代弁社数      … 弁済対象の社数（予定・和解後とも同じ定義）
 *   ・予定弁済総数  … 弁済対象の支払回数の合計。和解済は和解の回数、
 *                     未和解は和解予定回数（見込み）を使う
 *   ・和解弁済総数  … 弁済対象のうち和解が成立した債権者の支払回数の合計
 *
 * ※ 支払回数は「和解内容詳細」にしか無く、債権者名が突合できていない分は
 *    空のままなので、読み替えが済むまでは実態より小さく出る。
 */
import { SETTLED_CREDITOR_STATUSES } from '../constants/fieldOptions'
import type { Creditor } from '../types'

/** 弁済代行の対象になる債権者か（受任対象外・弁済除外を外す） */
export function isRepaymentTarget(c: Creditor): boolean {
  if (c.status === '受任対象外') return false
  return c.repaymentTarget !== '停止' && c.repaymentTarget !== '終了'
}

/** 和解が成立している債権者か */
export function isSettledCreditor(c: Creditor): boolean {
  return (SETTLED_CREDITOR_STATUSES as readonly string[]).includes(c.status)
}

export type SettlementTotals = {
  /** 予定代弁社数（＝弁済対象の社数） */
  plannedAgentCount: number
  /** 和解後代弁社数（＝弁済対象の社数） */
  postSettlementPaymentCount: number
  /** 予定弁済総数（弁済対象の支払回数の合計） */
  plannedPaymentCount: number
  /** 和解弁済総数（弁済対象かつ和解済の支払回数の合計） */
  settlementCount: number
  /** 支払回数が未入力の弁済対象の社数（数字が過小になっていないかの目安） */
  missingPaymentCount: number
}

export function settlementTotals(creditors: Creditor[]): SettlementTotals {
  const targets = creditors.filter(isRepaymentTarget)
  const settled = targets.filter(isSettledCreditor)
  return {
    plannedAgentCount: targets.length,
    postSettlementPaymentCount: targets.length,
    plannedPaymentCount: targets.reduce(
      (sum, c) => sum + (c.paymentCount ?? c.expectedPaymentCount ?? 0),
      0
    ),
    settlementCount: settled.reduce((sum, c) => sum + (c.paymentCount ?? 0), 0),
    missingPaymentCount: targets.filter(
      (c) => c.paymentCount == null && c.expectedPaymentCount == null
    ).length,
  }
}
