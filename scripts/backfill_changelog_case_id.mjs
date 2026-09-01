/**
 * 過去の「削除」の変更履歴に案件IDを埋める。
 *
 * 事務所からのご指摘（堀本様 2026-08-22）:
 *   「接触履歴の枠自体を削除すると変更履歴の記録も一緒に消えてしまう」
 * 実際には削除の記録（before 付き）は残っており、案件の変更履歴が
 * 「いま存在する行の id」で絞っていたため一覧に出ていなかっただけだった。
 * 表示側は before.caseId で削除ぶんを拾うように直したが、それ以前に記録された
 * 分には before に caseId が入っていない。監査ログ（audit_logs）には
 * metadata.caseId が残っているので、そこから補う。
 *
 * 使い方:
 *   node scripts/backfill_changelog_case_id.mjs          … 確認のみ（既定）
 *   node scripts/backfill_changelog_case_id.mjs --apply  … 実際に更新する
 */
import { PrismaClient } from '@prisma/client'

const apply = process.argv.includes('--apply')
const prisma = new PrismaClient()

try {
  const logs = await prisma.changeLog.findMany({
    where: { action: 'DELETE', entity: { in: ['Creditor', 'Payment', 'ContactHistory', 'CaseReminder'] } },
    select: { id: true, entity: true, entityId: true, before: true },
  })
  console.log(`削除の変更履歴: ${logs.length} 件`)

  let filled = 0
  let already = 0
  let notFound = 0
  for (const log of logs) {
    const before = log.before
    if (before == null || typeof before !== 'object') continue
    if (before.caseId != null) { already++; continue }
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'DELETE', entity: log.entity, entityId: log.entityId },
      orderBy: { id: 'desc' },
      select: { metadata: true },
    })
    const caseId = audit?.metadata?.caseId
    if (caseId == null) { notFound++; continue }
    console.log(`  #${log.id} ${log.entity}/${log.entityId} → caseId=${caseId}`)
    if (apply) {
      await prisma.changeLog.update({
        where: { id: log.id },
        data: { before: { ...before, caseId } },
      })
    }
    filled++
  }
  console.log(`\n補える: ${filled} 件 / すでに入っている: ${already} 件 / 監査ログから引けない: ${notFound} 件`)
  if (!apply) console.log('※ 確認のみです。実際に更新するには --apply を付けてください。')
} finally {
  await prisma.$disconnect()
}
