/**
 * 案件一覧の行を展開して出す明細（kintone の「関連レコード一覧」相当）。
 *
 * kintone の「受任後リマインドリスト」では、案件の行に
 *   ・依頼者 接触履歴   … 表示する▶ / 閉じる▾
 *   ・和解対象債権一覧   … 表示する▶ / 閉じる▾
 * のリンクがあり、押すと行の下にその案件の明細表が開く。同じ挙動にする。
 *
 * データは案件ごとに開いたときだけ取りに行く（一覧の全件を先読みしない）。
 */
import { useEffect, useState } from 'react'
import type { ContactHistory, Creditor, PaymentRecord } from '../types'
import { isEmptyRow } from '../lib/paymentRows'

type Props = {
  caseId: number
  showContacts: boolean
  showCreditors: boolean
  showPayments: boolean
  showSettlement: boolean
}

const yen = (n: number | null | undefined) =>
  n != null ? `¥${n.toLocaleString()}` : ''

/** 明細表の共通スタイル（一覧本体より一段小さく、詰めて出す） */
const TH = 'whitespace-nowrap px-2 py-1 text-left font-medium text-slate-500'
const TD = 'whitespace-nowrap px-2 py-1 text-slate-700'

function Loading() {
  return <div className="px-3 py-2 text-[11px] text-slate-400">読み込み中…</div>
}

export function CaseRowDetail({
  caseId,
  showContacts,
  showCreditors,
  showPayments,
  showSettlement,
}: Props) {
  const [creditors, setCreditors] = useState<Creditor[] | null>(null)
  const [contacts, setContacts] = useState<ContactHistory[] | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null)

  useEffect(() => {
    if (!showPayments || payments != null) return
    let cancelled = false
    fetch(`/api/payments?caseId=${caseId}`)
      .then((r) => (r.ok ? (r.json() as Promise<PaymentRecord[]>) : []))
      .then((rows) => {
        if (!cancelled) setPayments(rows)
      })
      .catch(() => {
        if (!cancelled) setPayments([])
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, showPayments])

  useEffect(() => {
    if ((!showCreditors && !showSettlement) || creditors != null) return
    let cancelled = false
    fetch(`/api/creditors?caseId=${caseId}`)
      .then((r) => (r.ok ? (r.json() as Promise<Creditor[]>) : []))
      .then((rows) => {
        if (!cancelled) setCreditors(rows)
      })
      .catch(() => {
        if (!cancelled) setCreditors([])
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, showCreditors, showSettlement])

  useEffect(() => {
    if (!showContacts || contacts != null) return
    let cancelled = false
    fetch(`/api/contact-histories?caseId=${caseId}`)
      .then((r) => (r.ok ? (r.json() as Promise<ContactHistory[]>) : []))
      .then((rows) => {
        if (!cancelled) setContacts(rows)
      })
      .catch(() => {
        if (!cancelled) setContacts([])
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, showContacts])

  // 依頼者ぶんだけを出す（債権者への接触は「和解対象債権一覧」側の話なので混ぜない）
  const clientContacts = (contacts ?? []).filter((h) => h.targetType !== '債権者')
  // 案件全体の入金予定だけを出す（債権者別の弁済予定は表示時に生成される別物）。
  // 合計行（予定日も実入金日も無い行）だけを除く。
  // 入金予定日が無くても実入金がある行（予定外入金）は表示する。
  const caseRows = (payments ?? []).filter((p) => p.creditorId == null && !isEmptyRow(p))
  // 和解内容詳細は「和解が成立している債権者」だけを出す（支払条件が決まっているもの）
  const settled = (creditors ?? []).filter(
    (c) => c.settlementDate != null || c.paymentStartMonth != null || c.paymentCount != null
  )

  return (
    <div className="space-y-2 border-l-4 border-blue-300 bg-slate-50 px-3 py-2">
      {showPayments && (
        <section>
          <div className="mb-1 text-[11px] font-semibold text-slate-600">
            入金情報
            {payments != null && (
              <span className="ml-1 font-normal text-slate-400">{caseRows.length}件</span>
            )}
          </div>
          {payments == null ? (
            <Loading />
          ) : caseRows.length === 0 ? (
            <div className="px-1 py-1 text-[11px] text-slate-400">入金予定がありません</div>
          ) : (
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-100">
                  <tr>
                    <th className={TH}>入金予定日</th>
                    <th className={`${TH} text-right`}>入金予定額</th>
                    <th className={`${TH} text-right`}>報酬充当予定額</th>
                    <th className={`${TH} text-right`}>弁代報酬充当予定額</th>
                    <th className={`${TH} text-right`}>ﾌﾟｰﾙ充当予定額</th>
                    <th className={`${TH} text-right`}>弁済充当予定額</th>
                    <th className={`${TH} text-right`}>社数</th>
                    <th className={`${TH} text-right`}>手数料</th>
                    <th className={TH}>実入金日</th>
                    <th className={`${TH} text-right`}>実入金額</th>
                    <th className={`${TH} text-right`}>報酬充当額</th>
                    <th className={`${TH} text-right`}>弁代報酬充当額</th>
                    <th className={`${TH} text-right`}>ﾌﾟｰﾙ充当額</th>
                    <th className={`${TH} text-right`}>弁済充当額</th>
                  </tr>
                </thead>
                <tbody>
                  {caseRows.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className={TD}>{p.plannedDate ?? ''}</td>
                      <td className={`${TD} text-right tabular-nums`}>{yen(p.plannedAmount)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{yen(p.plannedFeeAllocation)}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {yen(p.plannedAgentFeeAllocation)}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{yen(p.plannedPoolAllocation)}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {yen(p.plannedRepaymentAllocation)}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{p.repaymentCount ?? ''}</td>
                      <td className={`${TD} text-right tabular-nums`}>{yen(p.handlingFee)}</td>
                      <td className={TD}>{p.actualDate ?? ''}</td>
                      <td className={`${TD} text-right tabular-nums`}>{yen(p.actualAmount)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{yen(p.actualFeeAllocation)}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {yen(p.actualAgentFeeAllocation)}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{yen(p.actualPoolAllocation)}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {yen(p.actualRepaymentAllocation)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {showContacts && (
        <section>
          <div className="mb-1 text-[11px] font-semibold text-slate-600">
            依頼者 接触履歴
            {contacts != null && (
              <span className="ml-1 font-normal text-slate-400">{clientContacts.length}件</span>
            )}
          </div>
          {contacts == null ? (
            <Loading />
          ) : clientContacts.length === 0 ? (
            <div className="px-1 py-1 text-[11px] text-slate-400">接触履歴がありません</div>
          ) : (
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-100">
                  <tr>
                    <th className={TH}>接触日</th>
                    <th className={TH}>時刻</th>
                    <th className={TH}>担当</th>
                    <th className={TH}>ツール</th>
                    <th className={TH}>コメント</th>
                  </tr>
                </thead>
                <tbody>
                  {clientContacts.map((h) => (
                    <tr key={h.id} className="border-t border-slate-100">
                      <td className={TD}>{h.contactDate ?? ''}</td>
                      <td className={TD}>{h.contactTime ?? ''}</td>
                      <td className={TD}>{h.staff ?? ''}</td>
                      <td className={TD}>{h.tool ?? ''}</td>
                      <td className="px-2 py-1 text-slate-700">{h.comment ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {showCreditors && (
        <section>
          <div className="mb-1 text-[11px] font-semibold text-slate-600">
            和解対象債権一覧
            {creditors != null && (
              <span className="ml-1 font-normal text-slate-400">{creditors.length}社</span>
            )}
          </div>
          {creditors == null ? (
            <Loading />
          ) : creditors.length === 0 ? (
            <div className="px-1 py-1 text-[11px] text-slate-400">債権者がいません</div>
          ) : (
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-100">
                  <tr>
                    <th className={TH}>債権者</th>
                    <th className={TH}>交渉相手</th>
                    <th className={`${TH} text-right`}>申告額</th>
                    <th className={`${TH} text-right`}>想定和解</th>
                    <th className={TH}>債権者別ステータス</th>
                    <th className={TH}>CHECK</th>
                    <th className={TH}>次回処理日時</th>
                    <th className={TH}>受任通知送付日</th>
                    <th className={TH}>債権調査到着日</th>
                    <th className={TH}>顧客コード</th>
                    <th className={TH}>調査票_契約日</th>
                    <th className={`${TH} text-right`}>債務額</th>
                    <th className={`${TH} text-right`}>差額</th>
                    <th className={TH}>和解提案日</th>
                    <th className={`${TH} text-right`}>和解提案</th>
                    <th className={TH}>回答状況</th>
                    <th className={TH}>和解日</th>
                    <th className={`${TH} text-right`}>和解金額</th>
                    <th className={`${TH} text-right`}>和解時債務金額</th>
                    <th className={TH}>和解内容コメント</th>
                  </tr>
                </thead>
                <tbody>
                  {creditors.map((c) => {
                    // kintone の「差額」は 申告額 − 債務額
                    const diff =
                      c.declaredAmount != null && c.debtAmount != null
                        ? c.declaredAmount - c.debtAmount
                        : null
                    return (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className={TD}>{c.creditorName}</td>
                        <td className={TD}>{c.negotiationPartner ?? ''}</td>
                        <td className={`${TD} text-right tabular-nums`}>{yen(c.declaredAmount)}</td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {c.expectedSettlement != null ? `${c.expectedSettlement} 回` : ''}
                        </td>
                        <td className={TD}>{c.status}</td>
                        <td className={TD}>
                          {c.check ? (
                            <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">
                              CHECK
                            </span>
                          ) : (
                            ''
                          )}
                        </td>
                        <td className={TD}>{c.nextProcessDate ?? ''}</td>
                        <td className={TD}>{c.acceptanceNoticeSentDate ?? ''}</td>
                        <td className={TD}>{c.debtInquiryArrivalDate ?? ''}</td>
                        <td className={TD}>{c.customerCode ?? ''}</td>
                        <td className={TD}>{c.contractDate ?? ''}</td>
                        <td className={`${TD} text-right tabular-nums`}>{yen(c.debtAmount)}</td>
                        <td
                          className={`${TD} text-right tabular-nums ${diff != null && diff < 0 ? 'text-red-600' : ''}`}
                        >
                          {yen(diff)}
                        </td>
                        <td className={TD}>{c.settlementProposalDate ?? ''}</td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {c.settlementProposal != null ? `${c.settlementProposal} 回` : ''}
                        </td>
                        <td className={TD}>{c.responseStatus ?? ''}</td>
                        <td className={TD}>{c.settlementDate ?? ''}</td>
                        <td className={`${TD} text-right tabular-nums`}>{yen(c.settlementAmount)}</td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {yen(c.settlementDebtAmount)}
                        </td>
                        <td className="px-2 py-1 text-slate-700">
                          {c.settlementContentComment ?? ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {showSettlement && (
        <section>
          <div className="mb-1 text-[11px] font-semibold text-slate-600">
            和解内容詳細
            {creditors != null && (
              <span className="ml-1 font-normal text-slate-400">
                {settled.length}社（和解済）
              </span>
            )}
          </div>
          {creditors == null ? (
            <Loading />
          ) : settled.length === 0 ? (
            <div className="px-1 py-1 text-[11px] text-slate-400">和解内容がありません</div>
          ) : (
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-100">
                  <tr>
                    <th className={TH}>債権者</th>
                    <th className={TH}>和解日</th>
                    <th className={`${TH} text-right`}>和解金額</th>
                    <th className={TH}>支払開始月</th>
                    <th className={`${TH} text-right`}>支払回数</th>
                    <th className={`${TH} text-right`}>初回支払額</th>
                    <th className={`${TH} text-right`}>２回目以降支払額</th>
                    <th className={`${TH} text-right`}>最終支払額</th>
                    <th className={TH}>最終支払月</th>
                    <th className={TH}>将来利息</th>
                    <th className={TH}>振込先銀行名</th>
                    <th className={TH}>振込先支店名</th>
                    <th className={TH}>種別</th>
                    <th className={TH}>口座番号</th>
                    <th className={TH}>口座名義</th>
                    <th className={TH}>弁済対象</th>
                  </tr>
                </thead>
                <tbody>
                  {settled.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className={TD}>{c.creditorName}</td>
                      <td className={TD}>{c.settlementDate ?? ''}</td>
                      <td className={`${TD} text-right tabular-nums`}>{yen(c.settlementAmount)}</td>
                      <td className={TD}>{c.paymentStartMonth ?? ''}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {c.paymentCount != null ? `${c.paymentCount} 回` : ''}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{yen(c.firstPaymentAmount)}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {yen(c.subsequentPaymentAmount)}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{yen(c.finalPaymentAmount)}</td>
                      <td className={TD}>{c.finalPaymentMonth ?? ''}</td>
                      <td className={TD}>{c.futureInterest ?? ''}</td>
                      <td className={TD}>{c.bankName ?? ''}</td>
                      <td className={TD}>{c.branchName ?? ''}</td>
                      <td className={TD}>{c.accountType ?? ''}</td>
                      <td className={TD}>{c.accountNumber ?? ''}</td>
                      <td className={TD}>{c.accountHolder ?? ''}</td>
                      <td className={TD}>
                        {c.repaymentTarget ? (
                          <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">
                            {c.repaymentTarget}
                          </span>
                        ) : (
                          ''
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
