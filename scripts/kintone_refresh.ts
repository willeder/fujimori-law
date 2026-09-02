/**
 * kintone の最新内容を DB へ反映する（案件の id を変えない差分反映）。
 *
 * 事務所のご依頼（2026-09-02）:
 *   「現在の最新のkintoneのデータを反映させたい」「新システムはまだ利用されて
 *     いないので kintone に合わせて大丈夫」
 *
 * なぜ seed の全入れ替えを使わないか:
 *   prisma/seed.ts の既定モードは cases を TRUNCATE ... CASCADE する。
 *   受任資料（case_files）は案件にぶら下がっているため、34,477件の
 *   ファイル参照が道連れで消え、Supabase に入っている添付（約28GB）が
 *   画面から辿れなくなる。リマインドも同様に消える。
 *   そこで案件は id を変えずに中身だけ更新し、子（債権者・入金・接触履歴）を
 *   入れ替える方式にする。案件の id が変わらないので受任資料は無傷で残る。
 *
 * 突合キー:
 *   kintone の **レコード番号**。ID（118823E 等）は事務所側で直されることが
 *   あり当てにならない（末尾に余分な文字、先頭に空白などの実例あり）。
 *
 * 事前に:
 *   node scripts/kintone_pull.mjs
 *   python3 scripts/kintone_ndjson_to_csv.py
 *   REALDATA_SRC=docs/data/kintone/csv REALDATA_OUT=~/knew python3 scripts/generate_realdata_json.py
 *
 * 実行:
 *   DATA_DIR=~/knew npx tsx scripts/kintone_refresh.ts --dry-run
 *   DATA_DIR=~/knew npx tsx scripts/kintone_refresh.ts
 */
import { PrismaClient, ContactTarget } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flattenCase, type CaseJson } from '../prisma/seed'

const prisma = new PrismaClient()
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'public', 'data')
const DRY = process.argv.includes('--dry-run')
const read = <T,>(n: string): T => JSON.parse(readFileSync(join(DATA_DIR, n), 'utf-8')) as T
const d = (v: string | null | undefined): Date | null => (v ? new Date(v) : null)

/*
  DB の数値列は INT4（上限 2,147,483,647）。kintone にはこれを超える入力ミスが
  実在するため、そのまま入れると取込が丸ごと止まる。
  超えている値は空にして取り込み、最後に一覧で報告する（勝手に直さない）。
  実例: 114764E アコムの債務額 709,175,709,175 …「709175」の二重入力とみられる。
*/
const INT4_MAX = 2147483647
const overflow: string[] = []
function clampInt4<T extends Record<string, unknown>>(row: T, where: string): T {
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) > INT4_MAX) {
      overflow.push(`${where} ${k}=${v}`)
      ;(row as Record<string, unknown>)[k] = null
    }
  }
  return row
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function main() {
  console.log('DATA_DIR =', DATA_DIR, DRY ? '（下見のみ・書き込みなし）' : '')
  const cases = read<CaseJson[]>('cases.json')
  const creditors = read<any[]>('creditors.json')
  const payments = read<any[]>('payments.json')
  const contacts = read<any[]>('contactHistories.json')

  const existing = await prisma.case.findMany({ select: { id: true, recordNumber: true, externalId: true } })
  const byRn = new Map<number, number>()
  for (const c of existing) if (c.recordNumber != null) byRn.set(c.recordNumber, c.id)
  /*
    レコード番号が入っていない行の ID も控えておく。
    相談票の取込でこちらの画面から作った案件は、その時点では kintone に無いので
    レコード番号が空のまま入る。あとから同じ人が kintone にも登録されると、
    レコード番号では突合できず、ID の重複で取込が止まる（実例: 119638E 小野様、
    119398E 坂上様）。そういう行は ID で拾って同じ行を更新し、
    レコード番号を入れて以後はレコード番号で追えるようにする。
  */
  const byExtNoRn = new Map<string, number>()
  for (const c of existing) {
    const ext = (c.externalId ?? '').trim()
    if (c.recordNumber == null && ext !== '') byExtNoRn.set(ext, c.id)
  }

  const updates: { dbId: number; c: CaseJson }[] = []
  const inserts: CaseJson[] = []
  const adopted: string[] = []
  for (const c of cases) {
    const rn = (c.clientBasicInfo as any).recordNumber as number | null
    const ext = String((c.metadata as any).externalId ?? '').trim()
    const hit = rn != null ? byRn.get(rn) : undefined
    if (hit != null) {
      updates.push({ dbId: hit, c })
      continue
    }
    const byExt = ext !== '' ? byExtNoRn.get(ext) : undefined
    if (byExt != null) {
      updates.push({ dbId: byExt, c })
      adopted.push(`${ext}（レコード番号 ${rn} を付与）`)
      continue
    }
    inserts.push(c)
  }
  if (adopted.length > 0) {
    console.log(`  こちらで先に作っていた案件を kintone のレコードと結び付け: ${adopted.join(', ')}`)
  }
  const touched = new Set(updates.map((u) => u.dbId))
  const untouched = existing.filter((c) => !touched.has(c.id))

  console.log(`案件: 更新 ${updates.length} 件 / 新規 ${inserts.length} 件 / 触らない ${untouched.length} 件`)
  console.log(`  触らない案件: ${untouched.map((c) => c.externalId).join(', ') || 'なし'}`)
  console.log(`債権者 ${creditors.length} / 入金 ${payments.length} / 接触履歴 ${contacts.length} を入れ替えます`)
  if (DRY) {
    console.log('下見のみ。書き込みはしていません。')
    return
  }

  /* 1) 案件（id は変えない） */
  const localToDb = new Map<number, number>()
  let done = 0
  for (const part of chunk(updates, 200)) {
    await prisma.$transaction(
      part.map(({ dbId, c }) => {
        const { id: _local, ...flat } = flattenCase(c)
        localToDb.set(c.id, dbId)
        return prisma.case.update({
          where: { id: dbId },
          data: clampInt4(flat, `案件 ${(c.metadata as any).externalId}`),
        })
      })
    )
    done += part.length
    if (done % 400 === 0 || done === updates.length) console.log(`  更新 ${done}/${updates.length}`)
  }
  for (const c of inserts) {
    const { id: _local, ...flat } = flattenCase(c)
    const created = await prisma.case.create({
      data: clampInt4(flat, `案件 ${(c.metadata as any).externalId}`),
      select: { id: true },
    })
    localToDb.set(c.id, created.id)
    console.log(`  + ${(c.clientBasicInfo as any).recordNumber} / ${(c.metadata as any).externalId} / ${(c.clientBasicInfo as any).name} → id ${created.id}`)
  }

  /* 2) 子テーブルは対象案件ぶんだけ消して入れ直す */
  const targetIds = [...localToDb.values()]
  for (const part of chunk(targetIds, 2000)) {
    await prisma.payment.deleteMany({ where: { caseId: { in: part } } })
    await prisma.contactHistory.deleteMany({ where: { caseId: { in: part } } })
    await prisma.creditor.deleteMany({ where: { caseId: { in: part } } })
  }
  console.log('  古い債権者・入金・接触履歴を削除しました')

  // 債権者の id は JSON のものをそのまま使えない（触らない案件の分と衝突しうる）。
  // 残っている最大 id より後ろにずらして入れ、入金の creditorId も同じだけずらす。
  const maxCred = await prisma.creditor.aggregate({ _max: { id: true } })
  const OFFSET = (maxCred._max.id ?? 0) + 1000
  const credRows = creditors
    .filter((c) => localToDb.has(c.caseId))
    .map((c) => ({
      ...c,
      id: c.id + OFFSET,
      caseId: localToDb.get(c.caseId)!,
      nextProcessDate: d(c.nextProcessDate),
      acceptanceNoticeSentDate: d(c.acceptanceNoticeSentDate),
      debtInquiryArrivalDate: d(c.debtInquiryArrivalDate),
      contractDate: d(c.contractDate),
      settlementProposalDate: d(c.settlementProposalDate),
      settlementDate: d(c.settlementDate),
    }))
    .map((c) => clampInt4(c, `債権者 ${c.creditorName}(案件id ${c.caseId})`))
  let nc = 0
  for (const part of chunk(credRows, 1000)) {
    await prisma.creditor.createMany({ data: part })
    nc += part.length
    console.log(`  債権者 ${nc}/${credRows.length}`)
  }

  const payRows = payments
    .filter((p) => localToDb.has(p.caseId))
    .map(({ id: _i, ...p }: any) => ({
      ...p,
      caseId: localToDb.get(p.caseId)!,
      creditorId: p.creditorId != null ? p.creditorId + OFFSET : null,
      plannedDate: d(p.plannedDate),
      actualDate: d(p.actualDate),
      repaymentDate: d(p.repaymentDate),
    }))
    .map((p) => clampInt4(p, `入金(案件id ${p.caseId})`))
  let np = 0
  for (const part of chunk(payRows, 2000)) {
    await prisma.payment.createMany({ data: part })
    np += part.length
    if (np % 20000 === 0 || np === payRows.length) console.log(`  入金 ${np}/${payRows.length}`)
  }

  const contactRows = contacts
    .filter((h) => localToDb.has(h.caseId))
    .map((h: any) => ({
      caseId: localToDb.get(h.caseId)!,
      contactDate: d(h.contactDate),
      contactTime: h.contactTime ?? null,
      staff: h.staff ?? null,
      tool: h.tool ?? null,
      targetType: h.targetType === '債権者' ? ContactTarget.CREDITOR : ContactTarget.CLIENT,
      creditorName: h.creditorName ?? null,
      comment: h.comment ?? null,
    }))
  let nh = 0
  for (const part of chunk(contactRows, 5000)) {
    await prisma.contactHistory.createMany({ data: part })
    nh += part.length
    console.log(`  接触履歴 ${nh}/${contactRows.length}`)
  }

  /* 3) 採番を実データの最大値に合わせ直す */
  for (const t of ['cases', 'creditors', 'payments', 'contact_histories']) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${t}"','id'), COALESCE((SELECT MAX(id) FROM "${t}"), 1), true)`
    )
  }
  if (overflow.length > 0) {
    console.log(`\n■ 桁が大きすぎて取り込めなかった値 ${overflow.length} 件（空欄にしました。kintone側の修正が必要です）`)
    for (const o of overflow) console.log('   ', o)
  }
  console.log('完了。')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
