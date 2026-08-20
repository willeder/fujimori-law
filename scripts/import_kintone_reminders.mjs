/**
 * kintone の「★リマインド」行を case_reminders へ取り込む。
 *
 * kintone では和解対象債権のサブテーブル（テーブル_0）に
 * 債権者名「★リマインド」「★リマインド用★」等の行を作り、
 *   次回処理日時 = いつやるか
 *   交渉相手     = やること
 * として運用していた。債権者の行に混ざっているため債権社数・申告額の集計を
 * 狂わせる。取込時は債権者としては捨て、こちらの表へ移す。
 *
 * 実データの内訳（2026-08-19 時点・records.ndjson）:
 *   ★で始まる行            1,417
 *   うち中身のある行          334（296案件）… これだけを取り込む
 *   残り                   1,083 … 債権者名だけの空枠（日付も本文も無い）
 *
 * ★ kintone の check 列（225件で ON）は「済」ではない。
 *   過去日にも未来日にも付いており、リマインド列（計算値）と1対1で対応する。
 *   kintone側の通知を出すか否かのフラグと見られるため、done には写さず
 *   すべて「未対応」で取り込む。意味が確定したら done へ寄せること。
 *
 * 使い方:
 *   node scripts/import_kintone_reminders.mjs [--dry-run]
 *
 * 案件の突合は kintone の **レコード番号** を第一キーにする。
 *   ID（118823E 等）は事務所側で直されることがあり当てにならない。
 *   実例: DB「152161Ew」→ kintone「152161E」に修正済み（同一人物・レコード番号1538）
 *         「 116387E」（先頭に空白）、「110875Ee」（末尾に余分な e）
 *   レコード番号なら kintone 側で不変なので、これらを全部拾える。
 *
 * 何度実行しても安全（同じ案件・同じ期日・同じ本文の行は作り直さない）。
 * ただし pnpm db:seed で cases を TRUNCATE すると FK の CASCADE で消えるので、
 * seed をやり直した後はこのスクリプトを再実行すること。
 */
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'

const RECORDS = 'docs/data/kintone/records.ndjson'
const SUBTABLE = 'テーブル_0'
const DRY = process.argv.includes('--dry-run')

try {
  process.loadEnvFile('.env')
} catch {
  /* .env が無くても環境変数で渡されていれば動く */
}

const prisma = new PrismaClient()

const val = (row, key) => {
  const v = row.value?.[key]?.value
  return typeof v === 'string' ? v.trim() : v
}

async function main() {
  const text = await readFile(RECORDS, 'utf8')

  const items = []
  let starRows = 0
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const rec = JSON.parse(t)
    const ext = String(rec['ID']?.value ?? '').trim()
    const recordNumber = Number(rec['レコード番号']?.value)
    const clientName = rec['名前']?.value ?? ''
    const sub = rec[SUBTABLE]
    if (!sub) continue
    for (const row of sub.value) {
      const name = val(row, '債権者')
      if (typeof name !== 'string' || !name.startsWith('★')) continue
      starRows++
      const body = val(row, '交渉相手') || ''
      const due = val(row, '次回処理日時') || ''
      // 本文も期日も無い行は「枠だけ作って使わなかった」もの。取り込まない
      if (!body && !due) continue
      items.push({
        externalId: ext,
        recordNumber: Number.isFinite(recordNumber) ? recordNumber : null,
        clientName,
        // 本文が空で期日だけの行は、何をするか分からないので期日を本文代わりに置く
        body: body || `（kintoneに内容の記載なし・期日 ${due.slice(0, 10)}）`,
        dueDate: due ? due.slice(0, 10) : null,
      })
    }
  }

  console.log(`★行 ${starRows} 件のうち、中身のある ${items.length} 件が対象`)

  const cases = await prisma.case.findMany({
    select: { id: true, externalId: true, recordNumber: true },
  })
  // 第一キー: kintone のレコード番号（不変）。第二キー: 前後の空白を落としたID
  const byRecordNumber = new Map(
    cases.filter((c) => c.recordNumber != null).map((c) => [c.recordNumber, c.id]),
  )
  const byExt = new Map(
    cases.filter((c) => c.externalId).map((c) => [c.externalId.trim(), c.id]),
  )

  const existing = await prisma.caseReminder.findMany({
    where: { source: 'kintone-migration' },
    select: { caseId: true, dueDate: true, body: true },
  })
  const keyOf = (caseId, dueYmd, body) => `${caseId}|${dueYmd ?? ''}|${body}`
  const seen = new Set(
    existing.map((r) => keyOf(r.caseId, r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null, r.body)),
  )

  const data = []
  const missing = []
  let dup = 0
  let viaRecordNumber = 0
  for (const it of items) {
    const caseId =
      (it.recordNumber != null ? byRecordNumber.get(it.recordNumber) : undefined) ??
      byExt.get(it.externalId)
    if (!caseId) {
      missing.push(it)
      continue
    }
    if (it.recordNumber != null && byRecordNumber.has(it.recordNumber)) viaRecordNumber++
    const k = keyOf(caseId, it.dueDate, it.body)
    if (seen.has(k)) {
      dup++
      continue
    }
    seen.add(k)
    data.push({
      caseId,
      dueDate: it.dueDate ? new Date(`${it.dueDate}T00:00:00Z`) : null,
      body: it.body.slice(0, 2000),
      done: false,
      source: 'kintone-migration',
      createdBy: 'kintone-migration',
      updatedBy: 'kintone-migration',
    })
  }

  console.log(
    `登録対象 ${data.length} 件（うちレコード番号で突合 ${viaRecordNumber} 件` +
      ` / 案件なし ${missing.length} / 取込済 ${dup}）`,
  )
  if (missing.length > 0) {
    // 「案件なし」は原因を必ず出す。黙って落とすとリマインドが消えたことに気づけない
    console.log('  ▼ システムに該当案件が無いため取り込めなかった行:')
    const seenCase = new Set()
    for (const m of missing) {
      const k = `${m.recordNumber}`
      if (seenCase.has(k)) continue
      seenCase.add(k)
      const same = missing.filter((x) => x.recordNumber === m.recordNumber).length
      console.log(
        `    レコード番号 ${m.recordNumber} / ID ${m.externalId} / ${m.clientName}` +
          `（${same}件）`,
      )
    }
  }
  if (DRY) {
    for (const d of data.slice(0, 10)) {
      console.log('  ', d.caseId, d.dueDate?.toISOString().slice(0, 10) ?? '期日なし', d.body.slice(0, 50))
    }
    await prisma.$disconnect()
    return
  }

  if (data.length > 0) {
    const r = await prisma.caseReminder.createMany({ data })
    console.log(`登録しました: ${r.count} 件`)
  }

  const total = await prisma.caseReminder.count()
  const undoneWithDue = await prisma.caseReminder.count({
    where: { done: false, dueDate: { not: null } },
  })
  console.log(`case_reminders 合計 ${total} 件（未対応かつ期日あり ${undoneWithDue} 件）`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
