/**
 * 突合コードA/B を反映した creditors.json を、対象案件ぶんだけ DB へ入れ替える。
 *
 *   DATA_DIR=<generate_realdata_json.py の出力先> npx tsx scripts/apply_creditor_merge.ts
 *
 * 既定はドライラン（トランザクションを最後に必ずロールバック）。
 * 実際に書き込むときだけ APPLY=1 を付ける。
 *
 * 対象は cases.json に載っている案件（externalId で DB と突合）だけ。
 * その案件の creditors を全削除して、JSON の行を入れ直す。
 *   - payments.creditorId は onDelete: SetNull だが、全件 null のため影響なし（事前確認済み）
 *   - creditor_files は 0 件のため影響なし（事前確認済み）
 * 事前バックアップ: scripts/backup_creditors.ts と DB内 creditors_backup_20260901。
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const prisma = new PrismaClient()
const DATA_DIR = process.env.DATA_DIR!
const APPLY = process.env.APPLY === '1'
const read = <T,>(n: string): T => JSON.parse(readFileSync(join(DATA_DIR, n), 'utf-8')) as T
const d = (v: string | null | undefined) => (v ? new Date(v) : null)
const chunk = <T,>(a: T[], n: number) => {
  const o: T[][] = []
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n))
  return o
}

class Rollback extends Error {}

async function main() {
  const cases = read<any[]>('cases.json')
  const creditors = read<any[]>('creditors.json')
  const extOf = new Map<number, string>(
    cases.map((c) => [c.id as number, String(c.metadata.externalId ?? '').trim()])
  )
  const db = await prisma.case.findMany({
    where: { externalId: { in: [...new Set(extOf.values())] } },
    select: { id: true, externalId: true },
  })
  const dbIdOf = new Map(db.map((c) => [String(c.externalId).trim(), c.id]))
  const missing = [...new Set(extOf.values())].filter((e) => !dbIdOf.has(e))
  if (missing.length) throw new Error(`DBに存在しない案件があります: ${missing.join(', ')}`)

  const caseIds = [...dbIdOf.values()]
  const rows = creditors.map(({ id: _drop, caseId, ...c }) => ({
    ...c,
    caseId: dbIdOf.get(extOf.get(caseId)!)!,
    nextProcessDate: d(c.nextProcessDate),
    acceptanceNoticeSentDate: d(c.acceptanceNoticeSentDate),
    debtInquiryArrivalDate: d(c.debtInquiryArrivalDate),
    contractDate: d(c.contractDate),
    settlementProposalDate: d(c.settlementProposalDate),
    settlementDate: d(c.settlementDate),
  }))

  const before = await prisma.creditor.count({ where: { caseId: { in: caseIds } } })
  console.log(`対象案件 ${caseIds.length} 件 / 変更前タブ ${before} 件 → 投入 ${rows.length} 件`)

  try {
    await prisma.$transaction(
      async (tx) => {
        const del = await tx.creditor.deleteMany({ where: { caseId: { in: caseIds } } })
        let ins = 0
        for (const part of chunk(rows, 500)) ins += (await tx.creditor.createMany({ data: part })).count
        const after = await tx.creditor.count({ where: { caseId: { in: caseIds } } })
        console.log(`  削除 ${del.count} 件 / 追加 ${ins} 件 / 反映後タブ ${after} 件`)
        if (after !== rows.length) throw new Error(`件数不一致: ${after} != ${rows.length}`)
        if (!APPLY) throw new Rollback()
      },
      { timeout: 180000, maxWait: 30000 }
    )
    console.log('コミットしました。')
  } catch (e) {
    if (e instanceof Rollback) console.log('ドライランのためロールバックしました（DBは未変更）。APPLY=1 で実行すると反映します。')
    else throw e
  }
  const fin = await prisma.creditor.count({ where: { caseId: { in: caseIds } } })
  console.log(`現在のDB上の対象案件タブ数: ${fin}`)
}
main().finally(() => prisma.$disconnect())
