/**
 * 入金データ取込（銀行入出金明細 → 入金スケジュールへの実入金反映）
 *
 * 修正依頼 No.88/90/91 対応。
 * ルールは 2026-05-12〜13 の田中さん定義（Telegram msg 285/294/302 相当）に基づく。
 *
 * ── 実入金反映（msg 285: 入金情報の計上定義）──
 *   A) 予定金額と同額   : 予定の各項目の数値を反映
 *   B) 予定金額より超過 : 報酬額などは予定のまま、プール金へ差額を加算
 *   C) 予定金額より不足 : 実入金額に合わせて各項目を反映（充当優先順位:
 *      弁済→弁代報酬→手数料→報酬）し、不足分の補充行を1行追加。
 *      ※元行の入金予定額は予定のまま（入金額相違でソート可能に）
 *
 * ── イレギュラー入金の取込ルール（msg 294: a〜e）──
 *   a) 既存データと同一日で入金があり、金額も同一         → 取り込まない
 *   b) 同一日2回入金の合算金額が既存データと同一           → 取り込まない
 *   c) 同一日2回入金で既存データがない                     → 1行に合算金額で反映
 *   d) 同一日2回入金で既存データに1回目が反映済み           → 2回目の金額だけを次の行に反映
 *   e) 同一日入金で金額が既存データと相違                   → 取込みエラーで表示
 *
 * 一般化した判定（同一日・同一案件の入金明細群 deposits と既存実入金 existing）:
 *   - sum(deposits) == sum(existing)               → skip     （a・b）
 *   - existing なし                                → reflect  合算額を次の未入金行へ（c・通常）
 *   - 0 < sum(existing) < sum(deposits)            → reflect  差額のみ次の未入金行へ（d）
 *   - それ以外（金額の食い違い）                    → error    （e）
 */
import { prisma } from './db.js'
import { decodeCsvBytes, parseCsv } from './intakeImport.js'
import { isXlsx, parseXlsxToRows } from './xlsxLite.js'
import { writeAudit, type Actor } from './audit.js'

/** 銀行明細1行（入金のみ対象） */
export interface DepositRow {
  rowNo: number
  date: string // YYYY-MM-DD
  amount: number
  /** 振込入金口座（バーチャル口座）番号。案件との突合キー */
  accountNumber: string | null
  /** 振込依頼人名（表示用） */
  payerName: string | null
}

export interface DepositGroupPlan {
  date: string
  accountNumber: string | null
  payerName: string | null
  deposits: { rowNo: number; amount: number }[]
  depositSum: number
  caseId: number | null
  externalId: string | null
  clientName: string | null
  /** 判定結果 */
  action: 'skip' | 'reflect' | 'error' | 'unmatched'
  /** 反映額（reflect時。d では差額のみ） */
  reflectAmount: number | null
  /** 反映先の入金予定行 */
  targetPaymentId: number | null
  targetPlannedDate: string | null
  targetPlannedAmount: number | null
  /** A/B/C の別（reflect時） */
  pattern: 'A' | 'B' | 'C' | null
  /** C のとき追加する補充行の金額 */
  supplementAmount: number | null
  /** 人向けの説明 */
  note: string
}

export interface DepositPreview {
  encoding: string
  headerFound: boolean
  rows: number
  groups: DepositGroupPlan[]
  errorCount: number
  unmatchedCount: number
}

const norm = (s: string): string =>
  (s ?? '')
    .replace(/\s+/g, '')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .toLowerCase()

/** 日付文字列を YYYY-MM-DD に（YYYY/M/D, YYYY-MM-DD, YYYYMMDD, Excelシリアル値対応） */
export function toIsoDate(v: string): string | null {
  const s = (v ?? '').trim()
  if (s === '') return null
  let m = s.match(/^(\d{4})[/\-年.](\d{1,2})[/\-月.](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // Excel シリアル値（1900年基準）
  if (/^\d{5}$/.test(s)) {
    const n = Number(s)
    if (n > 20000 && n < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
      return dt.toISOString().slice(0, 10)
    }
  }
  return null
}

const toAmount = (v: string): number | null => {
  const s = (v ?? '').replace(/[,，\s円¥\\"]/g, '').trim()
  if (s === '' || s === '-') return null
  if (!/^-?\d+$/.test(s)) return null
  return Number(s)
}

/**
 * 明細CSV/Excelをパースして入金行を抽出する。
 * ヘッダー行を自動検出し、列は名称の部分一致で柔軟にマッピングする
 * （GMOあおぞらの入出金明細・バーチャル口座明細のどちらの形式でも読めるように）。
 */
export function parseDeposits(buf: Buffer): {
  encoding: string
  headerFound: boolean
  rows: DepositRow[]
} {
  let allRows: string[][]
  let encoding: string
  if (isXlsx(buf)) {
    allRows = parseXlsxToRows(buf)
    encoding = 'xlsx'
  } else {
    const dec = decodeCsvBytes(buf)
    allRows = parseCsv(dec.text)
    encoding = dec.encoding
  }
  const rows = allRows.filter((r) => r.some((c) => (c ?? '').trim() !== ''))
  if (rows.length === 0) return { encoding, headerFound: false, rows: [] }

  // ヘッダー行の検出（日付系と金額系の列名を含む行を先頭5行から探す）
  const dateHeads = ['取引日', '入金日', '日付', '振込日', '起算日']
  const amountHeads = ['入金金額', '入金額', '取引金額', '金額']
  const acctHeads = ['振込入金口座番号', 'バーチャル口座', 'v口座', '口座番号', '振込入金口座']
  const payerHeads = ['振込依頼人名', '依頼人名', '振込人名義', '振込人', '摘要', '名義']

  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const n = rows[i].map(norm)
    const hasDate = dateHeads.some((h) => n.some((c) => c.includes(norm(h))))
    const hasAmount = amountHeads.some((h) => n.some((c) => c.includes(norm(h))))
    if (hasDate && hasAmount) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) return { encoding, headerFound: false, rows: [] }

  const header = rows[headerIdx].map(norm)
  const findCol = (names: string[]): number => {
    for (const nm of names) {
      const i = header.findIndex((c) => c === norm(nm))
      if (i >= 0) return i
    }
    for (const nm of names) {
      const i = header.findIndex((c) => c.includes(norm(nm)))
      if (i >= 0) return i
    }
    return -1
  }
  const dateIdx = findCol(dateHeads)
  const amountIdx = findCol(amountHeads)
  // 出金金額列がある場合（総合明細）、入金のみ対象にする
  const outIdx = findCol(['出金金額', '出金額'])
  const acctIdx = findCol(acctHeads)
  const payerIdx = findCol(payerHeads)

  const out: DepositRow[] = []
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const cell = (idx: number) => (idx >= 0 && idx < r.length ? (r[idx] ?? '') : '')
    const date = toIsoDate(cell(dateIdx))
    const amount = toAmount(cell(amountIdx))
    const outgo = outIdx >= 0 ? toAmount(cell(outIdx)) : null
    if (!date || amount == null || amount <= 0) return
    if (outgo != null && outgo > 0) return // 出金明細は対象外
    out.push({
      rowNo: headerIdx + 2 + i,
      date,
      amount,
      accountNumber: cell(acctIdx).trim() || null,
      payerName: cell(payerIdx).trim() || null,
    })
  })
  return { encoding, headerFound: true, rows: out }
}

/** 実入金の充当計算（充当優先順位: 弁済→弁代報酬→手数料→報酬→プール） */
export function allocateActual(
  planned: {
    plannedAmount: number
    plannedFeeAllocation: number
    plannedAgentFeeAllocation: number
    plannedPoolAllocation: number
    plannedRepaymentAllocation: number
    handlingFee: number
  },
  actualAmount: number,
): {
  actualFeeAllocation: number | null
  actualAgentFeeAllocation: number | null
  actualPoolAllocation: number | null
  actualRepaymentAllocation: number | null
  handlingFee: number | null
  pattern: 'A' | 'B' | 'C'
  shortage: number
} {
  // A) 同額
  if (actualAmount === planned.plannedAmount) {
    return {
      actualFeeAllocation: planned.plannedFeeAllocation || null,
      actualAgentFeeAllocation: planned.plannedAgentFeeAllocation || null,
      actualPoolAllocation: planned.plannedPoolAllocation || null,
      actualRepaymentAllocation: planned.plannedRepaymentAllocation || null,
      handlingFee: planned.handlingFee || null,
      pattern: 'A',
      shortage: 0,
    }
  }
  // B) 超過: 予定のまま＋プールへ差額加算
  if (actualAmount > planned.plannedAmount) {
    const excess = actualAmount - planned.plannedAmount
    return {
      actualFeeAllocation: planned.plannedFeeAllocation || null,
      actualAgentFeeAllocation: planned.plannedAgentFeeAllocation || null,
      actualPoolAllocation: (planned.plannedPoolAllocation + excess) || null,
      actualRepaymentAllocation: planned.plannedRepaymentAllocation || null,
      handlingFee: planned.handlingFee || null,
      pattern: 'B',
      shortage: 0,
    }
  }
  // C) 不足: 優先順位順に充当し、残りは補充行へ
  let remaining = actualAmount
  const repayment = Math.min(remaining, planned.plannedRepaymentAllocation)
  remaining -= repayment
  const agentFee = Math.min(remaining, planned.plannedAgentFeeAllocation)
  remaining -= agentFee
  const handling = Math.min(remaining, planned.handlingFee)
  remaining -= handling
  const fee = Math.min(remaining, planned.plannedFeeAllocation)
  remaining -= fee
  const pool = remaining // 残り（通常0）
  return {
    actualRepaymentAllocation: repayment || null,
    actualAgentFeeAllocation: agentFee || null,
    handlingFee: handling || null,
    actualFeeAllocation: fee || null,
    actualPoolAllocation: pool || null,
    pattern: 'C',
    shortage: planned.plannedAmount - actualAmount,
  }
}

type PaymentRow = {
  id: number
  caseId: number
  creditorId: number | null
  plannedDate: Date | null
  plannedAmount: number | null
  plannedFeeAllocation: number | null
  plannedAgentFeeAllocation: number | null
  plannedPoolAllocation: number | null
  plannedRepaymentAllocation: number | null
  actualDate: Date | null
  actualAmount: number | null
  handlingFee: number | null
}

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

/** 取込プランを作成（プレビューとコミットで共通） */
export async function planDepositImport(buf: Buffer): Promise<DepositPreview> {
  const parsed = parseDeposits(buf)
  const groups: DepositGroupPlan[] = []
  if (!parsed.headerFound) {
    return {
      encoding: parsed.encoding,
      headerFound: false,
      rows: 0,
      groups,
      errorCount: 0,
      unmatchedCount: 0,
    }
  }

  // 口座番号 → 案件 の突合マップ
  const accts = [...new Set(parsed.rows.map((r) => r.accountNumber).filter((s): s is string => !!s))]
  const cases = accts.length
    ? await prisma.case.findMany({
        where: { vAccountNumber: { in: accts } },
        select: { id: true, externalId: true, name: true, vAccountNumber: true },
      })
    : []
  const byAcct = new Map(cases.map((c) => [c.vAccountNumber as string, c]))

  // 同一案件（口座）・同一日でグループ化（a〜e は「同一日」の単位で判定）
  const keyOf = (r: DepositRow) => `${r.accountNumber ?? `?${r.payerName ?? ''}`} ${r.date}`
  const grouped = new Map<string, DepositRow[]>()
  for (const r of parsed.rows) {
    const k = keyOf(r)
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k)!.push(r)
  }

  for (const [, rows] of grouped) {
    const { date, accountNumber, payerName } = rows[0]
    const depositSum = rows.reduce((s, r) => s + r.amount, 0)
    const kase = accountNumber ? byAcct.get(accountNumber) : undefined
    const base: Omit<DepositGroupPlan, 'action' | 'note'> = {
      date,
      accountNumber,
      payerName,
      deposits: rows.map((r) => ({ rowNo: r.rowNo, amount: r.amount })),
      depositSum,
      caseId: kase?.id ?? null,
      externalId: kase?.externalId ?? null,
      clientName: kase?.name ?? null,
      reflectAmount: null,
      targetPaymentId: null,
      targetPlannedDate: null,
      targetPlannedAmount: null,
      pattern: null,
      supplementAmount: null,
    }
    if (!kase) {
      groups.push({
        ...base,
        action: 'unmatched',
        note: accountNumber
          ? `バーチャル口座 ${accountNumber} に一致する案件がありません`
          : '口座番号が明細にありません（手動で反映してください）',
      })
      continue
    }

    const payments: PaymentRow[] = await prisma.payment.findMany({
      where: { caseId: kase.id },
      orderBy: [{ plannedDate: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        caseId: true,
        creditorId: true,
        plannedDate: true,
        plannedAmount: true,
        plannedFeeAllocation: true,
        plannedAgentFeeAllocation: true,
        plannedPoolAllocation: true,
        plannedRepaymentAllocation: true,
        actualDate: true,
        actualAmount: true,
        handlingFee: true,
      },
    })

    // 既存データ＝同一日の実入金
    const existingSameDay = payments.filter((p) => iso(p.actualDate) === date)
    const existingSum = existingSameDay.reduce((s, p) => s + (p.actualAmount ?? 0), 0)

    if (existingSameDay.length > 0 && existingSum === depositSum) {
      // a) / b) 取り込まない
      groups.push({
        ...base,
        action: 'skip',
        note: `同一日の実入金 ${existingSum.toLocaleString()}円 が反映済みのため取込みません（ルールa/b）`,
      })
      continue
    }

    let reflectAmount = depositSum
    let ruleNote = ''
    if (existingSameDay.length > 0) {
      if (existingSum > 0 && existingSum < depositSum) {
        // d) 反映済み分を除いた差額のみ次の行へ
        reflectAmount = depositSum - existingSum
        ruleNote = `同一日に ${existingSum.toLocaleString()}円 反映済みのため差額のみ反映（ルールd）`
      } else {
        // e) 金額の相違 → エラー
        groups.push({
          ...base,
          action: 'error',
          note: `同一日の既存実入金 ${existingSum.toLocaleString()}円 と明細合計 ${depositSum.toLocaleString()}円 が相違しています（ルールe・要確認）`,
        })
        continue
      }
    } else if (rows.length > 1) {
      ruleNote = `同一日${rows.length}回の入金を合算して反映（ルールc）`
    }

    // 反映先: 未入金（actualDate なし・予定額あり）の最も古い行
    const target = payments.find((p) => p.actualDate == null && (p.plannedAmount ?? 0) > 0)
    if (!target) {
      groups.push({
        ...base,
        action: 'error',
        note: '反映先の未入金予定行がありません（手動で行を追加してください）',
      })
      continue
    }
    const alloc = allocateActual(
      {
        plannedAmount: target.plannedAmount ?? 0,
        plannedFeeAllocation: target.plannedFeeAllocation ?? 0,
        plannedAgentFeeAllocation: target.plannedAgentFeeAllocation ?? 0,
        plannedPoolAllocation: target.plannedPoolAllocation ?? 0,
        plannedRepaymentAllocation: target.plannedRepaymentAllocation ?? 0,
        handlingFee: target.handlingFee ?? 0,
      },
      reflectAmount,
    )
    groups.push({
      ...base,
      action: 'reflect',
      reflectAmount,
      targetPaymentId: target.id,
      targetPlannedDate: iso(target.plannedDate),
      targetPlannedAmount: target.plannedAmount,
      pattern: alloc.pattern,
      supplementAmount: alloc.shortage > 0 ? alloc.shortage : null,
      note:
        [
          ruleNote,
          alloc.pattern === 'A'
            ? '予定と同額（パターンA）'
            : alloc.pattern === 'B'
              ? `予定より超過（パターンB・プールへ+${(reflectAmount - (target.plannedAmount ?? 0)).toLocaleString()}円）`
              : `予定より不足（パターンC・補充行 ${alloc.shortage.toLocaleString()}円 を追加）`,
        ]
          .filter(Boolean)
          .join('。') || '反映します',
    })
  }

  // 表示順: エラー → 未突合 → 反映 → スキップ、同分類内は日付順
  const order = { error: 0, unmatched: 1, reflect: 2, skip: 3 } as const
  groups.sort((a, b) => order[a.action] - order[b.action] || a.date.localeCompare(b.date))

  return {
    encoding: parsed.encoding,
    headerFound: true,
    rows: parsed.rows.length,
    groups,
    errorCount: groups.filter((g) => g.action === 'error').length,
    unmatchedCount: groups.filter((g) => g.action === 'unmatched').length,
  }
}

export interface DepositCommitResult {
  ok: boolean
  reflected: number
  skipped: number
  errors: number
  unmatched: number
  supplements: number
}

/** プランどおりに実入金を反映（reflect のみ実行。skip/error/unmatched は変更なし） */
export async function commitDepositImport(actor: Actor, buf: Buffer): Promise<DepositCommitResult> {
  const plan = await planDepositImport(buf)
  let reflected = 0
  let supplements = 0

  for (const g of plan.groups) {
    if (g.action !== 'reflect' || g.targetPaymentId == null || g.reflectAmount == null) continue
    await prisma.$transaction(async (tx) => {
      const target = await tx.payment.findUnique({ where: { id: g.targetPaymentId! } })
      if (!target || target.actualDate != null) return // 二重実行防止
      const alloc = allocateActual(
        {
          plannedAmount: target.plannedAmount ?? 0,
          plannedFeeAllocation: target.plannedFeeAllocation ?? 0,
          plannedAgentFeeAllocation: target.plannedAgentFeeAllocation ?? 0,
          plannedPoolAllocation: target.plannedPoolAllocation ?? 0,
          plannedRepaymentAllocation: target.plannedRepaymentAllocation ?? 0,
          handlingFee: target.handlingFee ?? 0,
        },
        g.reflectAmount!,
      )
      await tx.payment.update({
        where: { id: target.id },
        data: {
          actualDate: new Date(`${g.date}T00:00:00Z`),
          actualAmount: g.reflectAmount!,
          actualFeeAllocation: alloc.actualFeeAllocation,
          actualAgentFeeAllocation: alloc.actualAgentFeeAllocation,
          actualPoolAllocation: alloc.actualPoolAllocation,
          actualRepaymentAllocation: alloc.actualRepaymentAllocation,
          // handlingFee は不足時のみ実充当額で上書き（A/Bは予定のまま）
          ...(alloc.pattern === 'C' ? { handlingFee: alloc.handlingFee } : {}),
        },
      })
      reflected += 1
      // C) 不足分の補充行を追加（入金予定日: 実入金日の翌日〜次回予定日の前日）
      if (alloc.pattern === 'C' && alloc.shortage > 0) {
        const next = await tx.payment.findFirst({
          where: {
            caseId: target.caseId,
            actualDate: null,
            id: { not: target.id },
            plannedDate: { gt: target.plannedDate ?? undefined },
          },
          orderBy: [{ plannedDate: 'asc' }],
        })
        const dep = new Date(`${g.date}T00:00:00Z`)
        let suppDate = new Date(dep.getTime() + 86400000)
        if (next?.plannedDate) {
          const prevDay = new Date(next.plannedDate.getTime() - 86400000)
          if (prevDay > dep) suppDate = prevDay
        }
        await tx.payment.create({
          data: {
            caseId: target.caseId,
            creditorId: target.creditorId,
            plannedDate: suppDate,
            plannedAmount: alloc.shortage,
          },
        })
        supplements += 1
      }
    })
  }

  await writeAudit({
    actor,
    action: 'UPDATE',
    entity: 'Payment',
    summary: `入金データ取込: 反映${reflected}件・補充行${supplements}件・スキップ${plan.groups.filter((g) => g.action === 'skip').length}件・エラー${plan.errorCount}件・未突合${plan.unmatchedCount}件`,
    metadata: { source: 'deposit-import' },
  })

  return {
    ok: true,
    reflected,
    supplements,
    skipped: plan.groups.filter((g) => g.action === 'skip').length,
    errors: plan.errorCount,
    unmatched: plan.unmatchedCount,
  }
}
