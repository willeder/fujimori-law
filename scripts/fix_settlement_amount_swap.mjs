/**
 * 和解金額と支払回数が入れ替わって入っている債権者を修復する。
 *
 * 事務所からのご指摘:
 *   「和解時債務金額が和解の項目に入力されていたりと、入力先に誤りが生じている」
 * 取込側の列マッピングは修正済みで、DB 全体（債権者 16,596件）を照合しても
 * 支払回数に金額が入っている行は 0 件、和解金額が空の行も 0 件だった。
 * 残っていたのは下記 1 件だけで、これは移行の不具合ではなく **kintone 側の
 * 和解内容コメントの入力自体が金額と回数を取り違えている** ものである。
 *
 *   152211E 山長由紀代様 / イオン銀行（交渉相手: エーシーエス債権回収）
 *     コメント: 「和解金額：84円 … 支払回数：1,031,594回
 *                 月支払額：12,300円×83回 初回10,694円」
 *     12,300 × 83 + 10,694 = 1,031,594 なので、正しくは
 *       和解金額 1,031,594円 / 支払回数 84回。
 *     和解時債務金額（1,031,594）・債権額（1,031,594）とも一致する。
 *
 * kintone 側は事務所のご判断により触らない。新システム側の数値のみ直す。
 * 和解内容コメントは kintone の原文なのでそのまま残す。
 *
 * 使い方:
 *   node scripts/fix_settlement_amount_swap.mjs          … 確認のみ（既定）
 *   node scripts/fix_settlement_amount_swap.mjs --apply  … 実際に更新する
 * 更新前の値は docs/data/fixes/ に JSON で残す。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

/** 直す対象。id は本番DBの creditors.id */
const TARGETS = [
  {
    id: 13355,
    expectBefore: { settlementAmount: 84, paymentCount: null },
    after: { settlementAmount: 1031594, paymentCount: 84 },
    note: '152211E 山長由紀代様 / イオン銀行（kintoneのコメントで金額と回数が逆）',
  },
]

const apply = process.argv.includes('--apply')
const prisma = new PrismaClient()

try {
  const backups = []
  for (const t of TARGETS) {
    const row = await prisma.creditor.findUnique({
      where: { id: t.id },
      include: { case: { select: { externalId: true, name: true } } },
    })
    if (!row) {
      console.log(`× id=${t.id} が見つかりません。スキップします。`)
      continue
    }
    // 想定どおりの値かを確認してから直す（別の値なら手を付けない）
    const mismatch = Object.entries(t.expectBefore).filter(([k, v]) => row[k] !== v)
    if (mismatch.length > 0) {
      console.log(`× id=${t.id} は想定と違う値です。手を付けません。`)
      console.log(`   想定: ${JSON.stringify(t.expectBefore)}`)
      console.log(`   実際: ${JSON.stringify(Object.fromEntries(mismatch.map(([k]) => [k, row[k]])))}`)
      continue
    }
    console.log(`\n● ${t.note}`)
    console.log(`   ${row.case.externalId} ${row.case.name} / ${row.creditorName}`)
    for (const [k, v] of Object.entries(t.after)) {
      console.log(`   ${k}: ${JSON.stringify(row[k])} → ${JSON.stringify(v)}`)
    }
    backups.push(row)
    if (apply) {
      await prisma.creditor.update({ where: { id: t.id }, data: t.after })
      console.log('   → 更新しました')
    }
  }

  if (backups.length > 0) {
    mkdirSync('docs/data/fixes', { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const path = `docs/data/fixes/creditors-before-settlement-swap-${stamp}.json`
    writeFileSync(path, JSON.stringify(backups, null, 2), 'utf8')
    console.log(`\n更新前の値を ${path} に保存しました。`)
  }
  if (!apply) console.log('\n※ 確認のみです。実際に更新するには --apply を付けてください。')
} finally {
  await prisma.$disconnect()
}
