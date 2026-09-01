/**
 * creditors テーブルの全行を JSON でファイルに退避する（読み取りのみ）。
 * 出力: docs/data/backup_20260901/creditors_all_<timestamp>.json
 */
import { PrismaClient } from '@prisma/client'
import { writeFileSync, mkdirSync } from 'node:fs'
const prisma = new PrismaClient()
const OUT = process.env.BACKUP_DIR!
async function main() {
  mkdirSync(OUT, { recursive: true })
  const cases = await prisma.case.findMany({ select: { id: true, externalId: true, recordNumber: true } })
  const creditors = await prisma.creditor.findMany({ orderBy: { id: 'asc' } })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(`${OUT}/creditors_all_${stamp}.json`, JSON.stringify(creditors, null, 0), 'utf-8')
  writeFileSync(`${OUT}/cases_index_${stamp}.json`, JSON.stringify(cases, null, 0), 'utf-8')
  console.log(`backup: creditors ${creditors.length} 行 / cases ${cases.length} 行 → ${OUT} (${stamp})`)
}
main().finally(() => prisma.$disconnect())
