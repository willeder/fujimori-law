import { useRef, useState } from 'react'
import { useCaseEdit } from '../context/CaseEditContext'
import { useCaseDispatch, usePaymentsByCaseId } from '../store/useCaseStore'
import { DataTable, type Column } from '../components'
import { DueDateBulkEdit } from '../components/case/DueDateBulkEdit'
import type { PaymentRecord } from '../types'
import { nextPlannedDate } from '../lib/paymentRows'

interface PaymentTableProps {
  caseId: number
  payments: PaymentRecord[]
  /** 新規「入金予定を追加」時に付与する債権者ID。省略＝案件全体行 */
  scheduleCreditorId?: number | null
}

function fmtNum(n: number | null | undefined) {
  if (n == null) return <span className="text-slate-300">-</span>
  const isNegative = n < 0
  return <span className={isNegative ? 'text-red-600' : ''}>{n.toLocaleString()}</span>
}

/**
 * 振込1件あたりの手数料（円）。サーバ側（src/server/paymentSummary.ts の
 * HANDLING_FEE_UNIT）と同じ値。kintone の計算式「手数料＝弁済社数×129円」に対応する。
 */
const HANDLING_FEE_UNIT = 129

/**
 * 予定側の充当額を kintone の計算式どおりに埋める（堀本様 2026-08-10 のご要望）。
 *
 *   手数料         = 弁済社数 × 129円
 *   ﾌﾟｰﾙ充当予定額 = 入金予定額 − 報酬充当 − 弁代報酬充当 − 弁済充当 − 手数料
 *
 * kintone の実データ44,443行のうち44,442行でこの式が成立する（不成立の1行は手入力）。
 * 取込時（src/server/intakeImport.ts）には適用していたが画面の編集時には効いておらず、
 * 入金予定額や報酬額を直しても手数料・ﾌﾟｰﾙが手入力のままだった。
 *
 * 手で直した値は尊重する。この編集で手数料やﾌﾟｰﾙを触っていれば再計算しない。
 * 入金予定額が0の行（プール金からの充当など）はこの恒等式が成り立たないため触らない。
 */
function applyPlannedAllocations(
  payment: PaymentRecord,
  finalData: Partial<PaymentRecord>
): void {
  const n = (v: number | null | undefined) => v ?? 0
  const pick = <K extends keyof PaymentRecord>(k: K) =>
    (finalData[k] ?? payment[k]) as PaymentRecord[K]

  const plannedAmount = n(pick('plannedAmount') as number | null)
  if (plannedAmount <= 0) return

  const feeEdited = finalData.handlingFee !== payment.handlingFee
  const poolEdited = finalData.plannedPoolAllocation !== payment.plannedPoolAllocation

  const count = pick('repaymentCount') as number | null
  if (!feeEdited && count != null) {
    finalData.handlingFee = count * HANDLING_FEE_UNIT
  }
  // 弁済社数も手数料も分からない行は、残余のうちどこまでが手数料か決められない。
  // ここでﾌﾟｰﾙに全部寄せると手数料ぶんがﾌﾟｰﾙに紛れるので触らない
  // （既存データで30行だけこの形。いずれも残余がちょうど1社ぶんの手数料）。
  const feeKnown = (finalData.handlingFee ?? payment.handlingFee) != null
  if (!poolEdited && feeKnown) {
    const rest =
      plannedAmount -
      n(pick('plannedFeeAllocation') as number | null) -
      n(pick('plannedAgentFeeAllocation') as number | null) -
      n(pick('plannedRepaymentAllocation') as number | null)
    finalData.plannedPoolAllocation = rest - n(finalData.handlingFee ?? payment.handlingFee)
  }
}

/**
 * 実入金額に基づいて各充当額を自動計算する。
 * サーバ側の入金取込（src/server/depositImport.ts の allocateActual）と同じ規則。
 *
 * 【予定側】
 *   ﾌﾟｰﾙ充当予定額 = 入金予定額 − 報酬充当予定額 − 弁代報酬充当予定額 − 弁済充当予定額 − 手数料
 *   （kintone の実データ192,446行すべてで成立）
 *
 * 【実入金の反映】
 *   1. 入金があった時点で充当するのは 報酬 と 弁代報酬 だけ。
 *      弁済充当額・振)手数料・社数（実績）は、実際に債権者へ振り込んだ時点で計上する。
 *      振り込むまでの原資はプールに残る。
 *   2. 予定額に届かない不足分は、まずプール金から取り崩す。
 *      プール残高で足りない分だけ報酬を減らす（弁代報酬は必ず満額確保）。
 *   3. プール充当額は残余（実入金額 − 報酬 − 弁代報酬）。取り崩し分は負値になる。
 *
 *   A) 予定と同額 / B) 超過 → 報酬・弁代報酬は予定どおり、差額はプールへ
 *   C) 不足        → 上記2の順で吸収し、不足額の補充行を追加する
 *
 * @param poolBalance この行を反映する前の案件のプール残高（実プール充当額の累計）
 */
function calculateActualAllocations(
  payment: PaymentRecord,
  actualAmount: number | null,
  poolBalance: number
): Partial<PaymentRecord> {
  if (actualAmount == null) {
    return {
      actualFeeAllocation: null,
      actualAgentFeeAllocation: null,
      actualPoolAllocation: null,
      actualRepaymentAllocation: null,
      actualHandlingFee: null,
      actualRepaymentCount: null,
    }
  }

  const plannedAmount = payment.plannedAmount ?? 0
  const plannedFee = payment.plannedFeeAllocation ?? 0
  const plannedAgentFee = payment.plannedAgentFeeAllocation ?? 0

  const shortage = Math.max(0, plannedAmount - actualAmount)
  // 不足はまずプール残高で埋め、足りない分だけ報酬を減らす
  const fromPool = Math.min(shortage, Math.max(poolBalance, 0))
  const fee = plannedFee - (shortage - fromPool)
  const agentFee = plannedAgentFee
  // プールは残余。取り崩したときは負値になる（kintone にも負値の行がある）
  const pool = actualAmount - fee - agentFee

  return {
    actualFeeAllocation: fee || null,
    actualAgentFeeAllocation: agentFee || null,
    actualPoolAllocation: pool || null,
    // 弁済・手数料・社数（実績）は振込実行時に計上する
    actualRepaymentAllocation: null,
    actualHandlingFee: null,
    actualRepaymentCount: null,
  }
}

export function PaymentTable({
  caseId,
  payments,
  scheduleCreditorId,
}: PaymentTableProps) {
  // ロック中（他セッションが編集中）は行の編集・追加・削除を無効化する
  const { locked } = useCaseEdit()
  const dispatch = useCaseDispatch()
  const allCasePayments = usePaymentsByCaseId(caseId)
  const [editingId, setEditingId] = useState<number | null>(null)
  /**
   * 追加したけれどまだ保存していない行の id。
   * 以前は「入金予定を追加」を押した時点でサーバへ作られており、間違えて押しても
   * 消しに行くまで残った（事務所から「保存しないと反映されないようになってない。
   * 現状追加まちがってできてしまうので運用が難しい」とのご指摘。藤川様 2026-08-21）。
   * ここに入っている行は画面上だけの下書きで、「保存」を押して初めて作成する。
   */
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set())

  const unmarkPending = (id: number) =>
    setPendingIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  const [editData, setEditData] = useState<Partial<PaymentRecord>>({})

  // 一括表示（修正依頼㉗・45）。
  // 事務所からの指摘:
  //   「入金スケジュールが9〜10ヶ月分しか一度に見えない」
  //   「一括で見えるポップアップがほしい。選んだ行までスクロールしてほしい」
  // 表の高さを増やしたうえで、全期間を一度に見るための別窓を用意する。
  const [allOpen, setAllOpen] = useState(false)
  const [tall, setTall] = useState(false)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  /** 一括表示で選んだ行まで、表の中をスクロールして光らせる */
  const jumpTo = (id: number) => {
    setAllOpen(false)
    setHighlightId(id)
    requestAnimationFrame(() => {
      const row = wrapRef.current?.querySelector<HTMLElement>(`tr[data-row-key="${id}"]`)
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      // 光らせるのは一時的に。ずっと色が残ると実入金の色分けと紛らわしい
      window.setTimeout(() => setHighlightId((v) => (v === id ? null : v)), 2500)
    })
  }

  const sortedPayments = [...payments].sort((a, b) => {
    const dateA = a.plannedDate ?? ''
    const dateB = b.plannedDate ?? ''
    if (!dateA && !dateB) return 0
    if (!dateA) return 1
    if (!dateB) return -1
    return dateA.localeCompare(dateB)
  })

  /** 金額が空の入金行のひな形。追加はすべてここを通す */
  const blankRow = (
    id: number,
    plannedDate: string,
    creditorId: number | null,
    creditorInstallmentIndex: number | null
  ): PaymentRecord => ({
    id,
    caseId,
    creditorId,
    creditorInstallmentIndex,
    // 日付を空のまま作ると「中身の無い行」と判定されて画面に出ない。
    plannedDate,
    // 金額はすべて空で作る。直前の行からコピーすると、追加しただけで弁済予定が
    // 入ってしまい過弁済につながる（藤川様 2026-08-21）。
    plannedAmount: null,
    plannedFeeAllocation: null,
    plannedAgentFeeAllocation: null,
    plannedPoolAllocation: null,
    plannedRepaymentAllocation: null,
    actualDate: null,
    actualAmount: null,
    actualFeeAllocation: null,
    actualAgentFeeAllocation: null,
    actualPoolAllocation: null,
    actualRepaymentAllocation: null,
    handlingFee: null,
    repaymentCount: null,
    repaymentDate: null,
    actualRepaymentCount: null,
    actualHandlingFee: null,
    cumulativePool: null,
  })

  const nextTempId = () => Math.max(0, ...allCasePayments.map((p) => p.id)) + 1

  /**
   * その行のすぐ下に1行足す（kintone と同じく行ごとのアイコンから）。
   * 画面に足すだけで、サーバへは「保存」を押すまで送らない。
   *
   * 入金予定日は**押した行と同じ日**にする。表は予定日の順に並び、日付が同じ
   * 行は追加した順に並ぶので、これで押した行のすぐ下に入る。
   * 以前は翌月の日付を入れていたが、月次の予定表では翌月の行が既にあるため
   * その後ろに回り、2行下に出てしまっていた（事務所からのご指摘）。
   * 日付は追加後にそのまま編集できる。
   */
  const insertRowAfter = (item: PaymentRecord) => {
    if (locked) return
    const id = nextTempId()
    const row = blankRow(
      id,
      item.plannedDate ?? nextPlannedDate(payments),
      item.creditorId ?? (scheduleCreditorId === undefined ? null : scheduleCreditorId),
      item.creditorInstallmentIndex != null ? item.creditorInstallmentIndex + 1 : null
    )
    dispatch({ type: 'ADD_PAYMENT', payload: row })
    setPendingIds((prev) => new Set(prev).add(id))
    handleEdit(row)
  }

  const handleEdit = (payment: PaymentRecord) => {
    setEditingId(payment.id)
    setEditData({
      // 予定
      plannedDate: payment.plannedDate,
      plannedAmount: payment.plannedAmount,
      plannedFeeAllocation: payment.plannedFeeAllocation,
      plannedAgentFeeAllocation: payment.plannedAgentFeeAllocation,
      plannedPoolAllocation: payment.plannedPoolAllocation,
      plannedRepaymentAllocation: payment.plannedRepaymentAllocation,
      repaymentCount: payment.repaymentCount,
      handlingFee: payment.handlingFee,
      // 実績
      actualDate: payment.actualDate,
      actualAmount: payment.actualAmount,
      actualFeeAllocation: payment.actualFeeAllocation,
      actualAgentFeeAllocation: payment.actualAgentFeeAllocation,
      actualPoolAllocation: payment.actualPoolAllocation,
      actualRepaymentAllocation: payment.actualRepaymentAllocation,
      actualRepaymentCount: payment.actualRepaymentCount,
      actualHandlingFee: payment.actualHandlingFee,
      repaymentDate: payment.repaymentDate,
    })
  }

  const handleSave = (payment: PaymentRecord) => {
    const finalData = { ...editData }

    // 予定側は kintone の計算式で手数料・ﾌﾟｰﾙ充当予定額を埋める
    applyPlannedAllocations(payment, finalData)

    // 実入金日が入力されている場合、充当額を自動計算
    if (finalData.actualDate) {
      // 実入金額が未入力なら予定額をデフォルトで使用
      const actualAmount = finalData.actualAmount ?? payment.plannedAmount
      finalData.actualAmount = actualAmount

      // プール残高＝この行より前に実際にプールへ積まれた額の合計
      const poolBalance = allCasePayments
        .filter((p) => p.id !== payment.id)
        .reduce((sum, p) => sum + (p.actualPoolAllocation ?? 0), 0)
      // 各充当額を自動計算（手動入力がない場合のみ）
      const calculated = calculateActualAllocations(payment, actualAmount, poolBalance)
      if (finalData.actualFeeAllocation === payment.actualFeeAllocation) {
        finalData.actualFeeAllocation = calculated.actualFeeAllocation
      }
      if (finalData.actualAgentFeeAllocation === payment.actualAgentFeeAllocation) {
        finalData.actualAgentFeeAllocation = calculated.actualAgentFeeAllocation
      }
      if (finalData.actualPoolAllocation === payment.actualPoolAllocation) {
        finalData.actualPoolAllocation = calculated.actualPoolAllocation
      }
      // 弁済充当額・振)手数料・社数（実績）は振込実行時に入れる値なので、
      // 入金日を入れただけでは触らない（既に入っている値を消さない）。

      // 実入金が不足の場合、補充レコードを追加
      const plannedAmount = payment.plannedAmount ?? 0
      const shortage = plannedAmount - (actualAmount ?? 0)
      if (shortage > 0 && finalData.actualDate) {
        // 補充行の入金予定日は「不足が出た元の予定行と同じ日」にする。
        // （元の予定日が空のときだけ、実入金日をフォールバックに使う）
        const supplementDate = payment.plannedDate ?? finalData.actualDate

        // 新しい補充レコードを追加（サーバへも作成）
        const newId = Math.max(0, ...allCasePayments.map((p) => p.id)) + 1
        createPaymentRow({
          id: newId,
          caseId,
          creditorId: payment.creditorId,
          creditorInstallmentIndex: null,
          plannedDate: supplementDate,
          plannedAmount: shortage,
          plannedFeeAllocation: null,
          plannedAgentFeeAllocation: null,
          plannedPoolAllocation: null,
          plannedRepaymentAllocation: null,
          actualDate: null,
          actualAmount: null,
          actualFeeAllocation: null,
          actualAgentFeeAllocation: null,
          actualPoolAllocation: null,
          actualRepaymentAllocation: null,
          handlingFee: null,
          repaymentCount: null,
          repaymentDate: null,
          actualRepaymentCount: null,
          actualHandlingFee: null,
          cumulativePool: null,
        })
      }
    }

    const merged = { ...payment, ...finalData } as PaymentRecord
    if (pendingIds.has(payment.id)) {
      // 追加したばかりの下書き行。ここで初めてサーバに作る。
      dispatch({ type: 'UPDATE_PAYMENT', payload: merged })
      createPaymentRow(merged, { alreadyOnScreen: true })
      unmarkPending(payment.id)
    } else {
      dispatch({ type: 'UPDATE_PAYMENT', payload: merged })
      // 既存入金レコードはサーバへ永続化（変更履歴/監査はサーバ側）。
      // 自動補充で追加されたローカル行（DB未登録）は対象外（404は握りつぶす）。
      if (payment.id != null) {
        void fetch(`/api/payments/${payment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalData),
        }).catch((e) => console.error('入金更新の保存に失敗:', e))
      }
    }
    setEditingId(null)
    setEditData({})
  }

  const handleCancel = () => {
    // まだ保存していない行は、取消で画面からも消す。
    // 間違えて押したときにそのまま無かったことにできる。
    if (editingId != null && pendingIds.has(editingId)) {
      dispatch({ type: 'DELETE_PAYMENT', payload: editingId })
      unmarkPending(editingId)
    }
    setEditingId(null)
    setEditData({})
  }

  // 新規入金行をサーバへ作成。成功したら合成IDを実IDへ差し替える。
  // alreadyOnScreen: 下書きとして既に画面に出ている行（二重に足さない）。
  const createPaymentRow = (
    record: PaymentRecord,
    opts?: { alreadyOnScreen?: boolean }
  ) => {
    if (!opts?.alreadyOnScreen) dispatch({ type: 'ADD_PAYMENT', payload: record })
    void fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { row?: PaymentRecord } | null) => {
        if (res?.row && res.row.id !== record.id) {
          dispatch({ type: 'DELETE_PAYMENT', payload: record.id })
          dispatch({ type: 'ADD_PAYMENT', payload: res.row })
        }
      })
      .catch((e) => console.error('入金の作成に失敗:', e))
  }

  /**
   * 入金予定行の削除。
   * 辞任などで予定が大幅に不要になる場合に使う。
   * 実入金が入っている行は記録が失われるため、警告文を変えて二重に確認する。
   */
  const deletePaymentRow = (record: PaymentRecord) => {
    const hasActual = record.actualDate != null || (record.actualAmount ?? 0) !== 0
    const msg = hasActual
      ? `この行には実入金（${record.actualDate ?? ''} ${(record.actualAmount ?? 0).toLocaleString()}円）が記録されています。\n\n削除すると入金の記録が失われます。本当に削除しますか？`
      : `${record.plannedDate ?? ''} の入金予定（${(record.plannedAmount ?? 0).toLocaleString()}円）を削除します。よろしいですか？`
    if (!window.confirm(msg)) return
    dispatch({ type: 'DELETE_PAYMENT', payload: record.id })
    // まだ保存していない行はサーバに無いので消しに行かない
    if (pendingIds.has(record.id)) {
      unmarkPending(record.id)
      return
    }
    if (record.id != null) {
      void fetch(`/api/payments/${record.id}`, { method: 'DELETE' }).catch((e) =>
        console.error('入金行の削除に失敗:', e)
      )
    }
  }

  /**
   * 行ごとのプール残高（実プール充当額の累計）。
   * 実入金が不足したときはこの残高から取り崩すため、担当者が残高を追えるようにする。
   * 予定日順（＝表示順）に積み上げる。
   */
  const poolBalanceById = (() => {
    const m = new Map<number, number>()
    let run = 0
    for (const p of sortedPayments) {
      run += p.actualPoolAllocation ?? 0
      m.set(p.id, run)
    }
    return m
  })()

  /** 合計行に出す値 */
  const totals = sortedPayments.reduce(
    (t, p) => ({
      plannedAmount: t.plannedAmount + (p.plannedAmount ?? 0),
      plannedFee: t.plannedFee + (p.plannedFeeAllocation ?? 0),
      plannedAgentFee: t.plannedAgentFee + (p.plannedAgentFeeAllocation ?? 0),
      plannedPool: t.plannedPool + (p.plannedPoolAllocation ?? 0),
      handlingFee: t.handlingFee + (p.handlingFee ?? 0),
      plannedRepayment: t.plannedRepayment + (p.plannedRepaymentAllocation ?? 0),
      actualAmount: t.actualAmount + (p.actualAmount ?? 0),
      actualFee: t.actualFee + (p.actualFeeAllocation ?? 0),
      actualAgentFee: t.actualAgentFee + (p.actualAgentFeeAllocation ?? 0),
      actualPool: t.actualPool + (p.actualPoolAllocation ?? 0),
      actualHandlingFee: t.actualHandlingFee + (p.actualHandlingFee ?? 0),
      actualRepayment: t.actualRepayment + (p.actualRepaymentAllocation ?? 0),
    }),
    {
      plannedAmount: 0, plannedFee: 0, plannedAgentFee: 0, plannedPool: 0,
      handlingFee: 0, plannedRepayment: 0, actualAmount: 0, actualFee: 0,
      actualAgentFee: 0, actualPool: 0, actualHandlingFee: 0, actualRepayment: 0,
    }
  )
  /** 実入金がある行だけの予定額（差額の分母。未入金の行は差額に含めない） */
  const paidPlannedTotal = sortedPayments
    .filter((p) => p.actualDate)
    .reduce((sum, p) => sum + (p.plannedAmount ?? 0), 0)

  const inputCls =
    'box-border w-full min-w-0 max-w-full rounded border border-blue-300 px-1.5 py-0.5 text-xs leading-tight [color-scheme:light]'

  const columns: Column<PaymentRecord>[] = [
    {
      key: '__rowIndex',
      header: '',
      width: '2rem',
      align: 'center',
      sortable: false,
      headerClassName: 'bg-white',
      render: (_item, index) => (
        <span className="text-slate-500 tabular-nums">{index + 1}</span>
      ),
    },
    {
      key: 'plannedDate',
      header: '入金予定日',
      width: '6rem',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="date"
              value={editData.plannedDate ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedDate: e.target.value || null })
              }
              className={inputCls}
            />
          )
        }
        return (
          <span
            className={`whitespace-nowrap ${!item.actualDate ? 'font-medium text-slate-800' : ''}`}
          >
            {item.plannedDate ?? <span className="text-slate-300">-</span>}
          </span>
        )
      },
    },
    {
      key: 'plannedAmount',
      header: '入金予定額',
      width: '4.5rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.plannedAmount ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedAmount: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.plannedAmount)
      },
    },
    {
      key: 'plannedFeeAllocation',
      header: '報酬額',
      width: '4rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.plannedFeeAllocation ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedFeeAllocation: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.plannedFeeAllocation)
      },
    },
    {
      key: 'plannedAgentFeeAllocation',
      header: '弁代報酬',
      width: '4rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.plannedAgentFeeAllocation ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedAgentFeeAllocation: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.plannedAgentFeeAllocation)
      },
    },
    {
      key: 'plannedPoolAllocation',
      header: 'ﾌﾟｰﾙ',
      width: '3.5rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.plannedPoolAllocation ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedPoolAllocation: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.plannedPoolAllocation)
      },
    },
    {
      key: 'repaymentCount',
      header: '社数',
      width: '2.5rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.repaymentCount ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, repaymentCount: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.repaymentCount)
      },
    },
    {
      key: 'handlingFee',
      header: '手数料',
      width: '3.5rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.handlingFee ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, handlingFee: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.handlingFee)
      },
    },
    {
      key: 'plannedRepaymentAllocation',
      header: '弁済額',
      width: '4.5rem',
      align: 'right',
      headerClassName: 'bg-green-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.plannedRepaymentAllocation ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, plannedRepaymentAllocation: Number(e.target.value) || null })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.plannedRepaymentAllocation)
      },
    },
    {
      key: 'actualDate',
      header: '実入金日',
      width: '5rem',
      headerClassName: 'bg-blue-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="date"
              value={editData.actualDate ?? ''}
              onChange={(e) =>
                setEditData({ ...editData, actualDate: e.target.value || null })
              }
              className={inputCls}
            />
          )
        }
        return item.actualDate ? (
          <span className="whitespace-nowrap text-green-700">{item.actualDate}</span>
        ) : (
          <span className="whitespace-nowrap text-slate-300">未</span>
        )
      },
    },
    {
      key: 'actualAmount',
      header: '実入金額',
      width: '4.5rem',
      align: 'right',
      headerClassName: 'bg-blue-50',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualAmount ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualAmount: Number(e.target.value) || null,
                })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return item.actualAmount != null ? (
          <span className="font-medium text-green-700">
            {item.actualAmount.toLocaleString()}
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        )
      },
    },
    {
      key: '__diff',
      header: '差額',
      width: '4rem',
      align: 'right',
      sortable: false,
      headerClassName: 'bg-blue-50',
      // 実入金額 − 入金予定額。未入金の行は空欄。
      render: (item) => {
        if (!item.actualDate) return <span className="text-slate-300">-</span>
        const d = (item.actualAmount ?? 0) - (item.plannedAmount ?? 0)
        if (d === 0) return <span className="text-slate-400">0</span>
        return (
          <span className={d < 0 ? 'font-semibold text-red-600' : 'font-semibold text-blue-600'}>
            {d > 0 ? '+' : ''}
            {d.toLocaleString()}
          </span>
        )
      },
    },
    {
      key: 'actualFeeAllocation',
      header: '報酬充当',
      width: '4rem',
      align: 'right',
      headerClassName: 'bg-blue-50 whitespace-nowrap',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualFeeAllocation ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualFeeAllocation: Number(e.target.value) || null,
                })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.actualFeeAllocation)
      },
    },
    {
      key: 'actualAgentFeeAllocation',
      header: '弁代充当',
      width: '4rem',
      align: 'right',
      headerClassName: 'bg-blue-50 whitespace-nowrap',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualAgentFeeAllocation ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualAgentFeeAllocation: Number(e.target.value) || null,
                })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.actualAgentFeeAllocation)
      },
    },
    {
      key: 'actualPoolAllocation',
      header: 'ﾌﾟｰﾙ充当',
      width: '3.5rem',
      align: 'right',
      headerClassName: 'bg-blue-50 whitespace-nowrap',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualPoolAllocation ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualPoolAllocation: Number(e.target.value) || null,
                })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.actualPoolAllocation)
      },
    },
    // 実績側は kintone の「数」「振)手数料」を出す（予定側の 社数/手数料 とは別項目）。
    {
      key: 'actualRepaymentCount',
      header: '社数',
      width: '2.5rem',
      align: 'right',
      sortable: false,
      headerClassName: 'bg-blue-50',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualRepaymentCount ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualRepaymentCount: Number(e.target.value) || null,
                })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.actualRepaymentCount)
      },
    },
    {
      key: 'actualHandlingFee',
      header: '手数料',
      width: '3.5rem',
      align: 'right',
      sortable: false,
      headerClassName: 'bg-blue-50',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualHandlingFee ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualHandlingFee: Number(e.target.value) || null,
                })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.actualHandlingFee)
      },
    },
    {
      key: 'actualRepaymentAllocation',
      header: '弁済充当',
      width: '4.5rem',
      align: 'right',
      headerClassName: 'bg-blue-50 whitespace-nowrap',
      sortable: false,
      render: (item) => {
        if (editingId === item.id) {
          return (
            <input
              type="number"
              value={editData.actualRepaymentAllocation ?? ''}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  actualRepaymentAllocation: Number(e.target.value) || null,
                })
              }
              className={`${inputCls} text-right`}
            />
          )
        }
        return fmtNum(item.actualRepaymentAllocation)
      },
    },
    {
      key: '__poolBalance',
      header: 'プール残高',
      width: '5rem',
      align: 'right',
      sortable: false,
      headerClassName: 'bg-blue-50 whitespace-nowrap',
      // 実プール充当額の累計。不足入金のときはここから取り崩す。
      render: (item) => {
        const v = poolBalanceById.get(item.id) ?? 0
        return (
          <span className={v < 0 ? 'font-semibold text-red-600' : 'tabular-nums text-slate-700'}>
            {v.toLocaleString()}
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      width: '6.5rem',
      cellTruncate: false,
      sortable: false,
      headerClassName: 'bg-blue-50',
      render: (item) => {
        if (editingId === item.id) {
          return (
            <div className="flex shrink-0 flex-nowrap items-center gap-1">
              <button
                type="button"
                onClick={() => handleSave(item)}
                className="rounded bg-blue-500 px-2 py-0.5 text-xs text-white hover:bg-blue-600"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-300"
              >
                取消
              </button>
            </div>
          )
        }
        return (
          <div className="flex shrink-0 flex-nowrap items-center gap-0.5">
            <button
              type="button"
              onClick={() => insertRowAfter(item)}
              disabled={locked}
              title={
                locked
                  ? '他の人が編集中のため、いまは変更できません'
                  : 'この行のすぐ下に入金予定を1行足します（保存するまで反映されません）'
              }
              className="rounded px-1 py-0.5 text-sm leading-none text-emerald-600 hover:bg-emerald-50 disabled:text-slate-300 disabled:hover:bg-transparent"
              aria-label="この行のすぐ下に入金予定を追加"
            >
              ＋
            </button>
            <button
              type="button"
              onClick={() => handleEdit(item)}
              disabled={locked}
              title={locked ? '他の人が編集中のため、いまは変更できません' : undefined}
              className="rounded px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              編集
            </button>
            <button
              type="button"
              onClick={() => deletePaymentRow(item)}
              disabled={locked}
              title={locked ? '他の人が編集中のため、いまは変更できません' : 'この行を削除'}
              className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              削除
            </button>
          </div>
        )
      },
    },
  ]

  const yen = (n: number) => n.toLocaleString()
  const diffTotal = totals.actualAmount - paidPlannedTotal

  return (
    /*
      枠の高さいっぱいに縦に積み、スクロールするのは表の中身だけにする。
      合計とボタンは動かない場所に置くので、貼り付け（sticky）は使わない。
      以前は合計を貼り付けていたが、表の見出し行と同じ位置に重なって
      見出しを覆い隠してしまっていた（項目名が読めない状態）。
    */
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="shrink-0 space-y-2">
      {/* 合計（表示中の行の合計。予定と実績を並べて出す） */}
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
        <div className="flex w-max items-center gap-x-5 whitespace-nowrap text-[0.6875rem] leading-none text-slate-700">
          <span className="font-semibold text-slate-500">合計（{sortedPayments.length}行）</span>
          <span>
            入金予定額 <b className="tabular-nums">{yen(totals.plannedAmount)}</b>
          </span>
          <span>
            実入金額 <b className="tabular-nums text-blue-700">{yen(totals.actualAmount)}</b>
          </span>
          <span>
            差額{' '}
            <b
              className={`tabular-nums ${diffTotal < 0 ? 'text-red-600' : diffTotal > 0 ? 'text-blue-600' : 'text-slate-500'}`}
            >
              {diffTotal > 0 ? '+' : ''}
              {yen(diffTotal)}
            </b>
          </span>
          <span className="h-3 w-px bg-slate-300" aria-hidden />
          <span>
            報酬 <b className="tabular-nums">{yen(totals.actualFee)}</b>
            <span className="text-slate-400">／予定 {yen(totals.plannedFee)}</span>
          </span>
          <span>
            弁代報酬 <b className="tabular-nums">{yen(totals.actualAgentFee)}</b>
            <span className="text-slate-400">／予定 {yen(totals.plannedAgentFee)}</span>
          </span>
          <span>
            弁済 <b className="tabular-nums">{yen(totals.actualRepayment)}</b>
            <span className="text-slate-400">／予定 {yen(totals.plannedRepayment)}</span>
          </span>
          <span>
            手数料 <b className="tabular-nums">{yen(totals.actualHandlingFee)}</b>
            <span className="text-slate-400">／予定 {yen(totals.handlingFee)}</span>
          </span>
          <span className="h-3 w-px bg-slate-300" aria-hidden />
          <span>
            プール残高{' '}
            <b className={`tabular-nums ${totals.actualPool < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {yen(totals.actualPool)}
            </b>
          </span>
        </div>
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-2">
        {/*
          入金期日の一括変更（事務所のご要望 2026-09-03）。
          給料日が変わったときに、今日以降の入金予定日をまとめて直す。
          1案件あたり未来分は平均57行・最大127行あり、手で直すのは現実的でない。
        */}
        <DueDateBulkEdit
          caseId={caseId}
          onDone={() => {
            // 画面ごと再読込せず、この案件の入金明細だけ取り直して反映する
            void fetch(`/api/payments?caseId=${caseId}`)
              .then((r) => (r.ok ? (r.json() as Promise<PaymentRecord[]>) : []))
              .then((rows) => dispatch({ type: 'MERGE_PAYMENTS', payload: { caseId, rows } }))
              .catch(() => {})
          }}
        />
        <button
          type="button"
          onClick={() => setAllOpen(true)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
          title="全期間を別窓で一覧します。行を選ぶとこの表のその行へ移動します"
        >
          全期間を一覧（{sortedPayments.length}件）
        </button>
        <button
          type="button"
          onClick={() => setTall((v) => !v)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          {tall ? '表示を戻す' : '表を広げる'}
        </button>
        {/*
          追加は各行の「＋」で行うのが基本だが、1行も無いときは押す場所が無い。
          ここに置いておけば、行が無くても最初の1行を足せる。表の外の動かない
          場所なので、以前のように表の下に付いてスクロールを伸ばすことも無い。
        */}
        <button
          type="button"
          disabled={locked}
          title={
            locked
              ? '他の人が編集中のため、いまは変更できません'
              : '末尾に入金予定を1行足します（保存するまで反映されません）'
          }
          onClick={() => {
            const scopeCreditorId =
              scheduleCreditorId === undefined ? null : scheduleCreditorId
            const prevInstallmentMax = payments.reduce(
              (m, p) => Math.max(m, p.creditorInstallmentIndex ?? 0),
              0
            )
            const id = nextTempId()
            const row = blankRow(
              id,
              nextPlannedDate(payments),
              scopeCreditorId,
              scopeCreditorId != null ? prevInstallmentMax + 1 : null
            )
            // 画面に足すだけ。サーバへは「保存」を押してから送る
            dispatch({ type: 'ADD_PAYMENT', payload: row })
            setPendingIds((prev) => new Set(prev).add(id))
            handleEdit(row)
          }}
          className="rounded border border-dashed border-blue-300 bg-white px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-transparent"
        >
          ＋ 入金予定を追加
        </button>
      </div>
      </div>

      <div ref={wrapRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DataTable
        data={sortedPayments}
        columns={columns}
        keyField="id"
        emptyMessage="入金データがありません"
        density="default"
        stickyHeader
        cellSingleLine
        suspendTruncate={editingId !== null}
        enableFind
        /*
          既定は親の枠いっぱい（fillHeight）。高さを決め打ちしないので、
          タブ枠の高さを変えてもずれない。外側のタブ枠は
          activePanelOverflow="hidden" でスクロールしないため、動くのは
          この表の中身だけになる。
          「表を広げる」を押したときだけ、枠を越えて大きく取る。
        */
        fillHeight={!tall}
        bodyMaxHeightClassName={tall ? 'max-h-[80vh]' : undefined}
        getRowClassName={(item) => {
          // 一括表示から飛んできた行を一時的に光らせる
          if (highlightId === item.id) return 'bg-amber-100'
          // 実入金日がない場合はデフォルト
          if (!item.actualDate) return ''
          const planned = item.plannedAmount ?? 0
          const actual = item.actualAmount ?? 0
          // 実入金額 < 予定額: 赤い背景
          if (actual < planned) return 'bg-red-50'
          // 実入金額 > 予定額: 青い背景
          if (actual > planned) return 'bg-blue-50'
          return ''
        }}
      />
      </div>

      {allOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAllOpen(false)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <span className="text-sm font-bold text-slate-800">
                入金スケジュール（全{sortedPayments.length}件）
              </span>
              <button
                type="button"
                onClick={() => setAllOpen(false)}
                className="rounded px-2 py-0.5 text-sm text-slate-500 hover:bg-slate-100"
              >
                閉じる
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-2 py-1 text-left">入金予定日</th>
                    <th className="px-2 py-1 text-right">入金予定額</th>
                    <th className="px-2 py-1 text-left">実入金日</th>
                    <th className="px-2 py-1 text-right">実入金額</th>
                    <th className="px-2 py-1 text-right">弁済充当額</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPayments.map((p, i) => (
                    <tr
                      key={p.id}
                      onClick={() => jumpTo(p.id)}
                      className={`cursor-pointer border-b border-slate-100 hover:bg-blue-50 ${
                        i % 2 === 1 ? 'bg-slate-50' : ''
                      }`}
                      title="この行へ移動します"
                    >
                      <td className="px-2 py-1 tabular-nums">{p.plannedDate ?? '-'}</td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {p.plannedAmount != null ? p.plannedAmount.toLocaleString() : '-'}
                      </td>
                      <td className="px-2 py-1 tabular-nums">{p.actualDate ?? '-'}</td>
                      <td
                        className={`px-2 py-1 text-right tabular-nums ${
                          p.actualDate && (p.actualAmount ?? 0) < (p.plannedAmount ?? 0)
                            ? 'text-red-600'
                            : ''
                        }`}
                      >
                        {p.actualAmount != null ? p.actualAmount.toLocaleString() : '-'}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {p.actualRepaymentAllocation != null
                          ? p.actualRepaymentAllocation.toLocaleString()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
