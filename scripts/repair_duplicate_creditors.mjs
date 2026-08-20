/**
 * 取込時に消えていた「同名の債権者」の行を、既存DBへ足して修復する。
 *
 * 事務所からのご指摘:
 *   「弁済社数が3なのにタブが存在してない」
 * 原因は取込側で (案件ID, 債権者名) を一意キーにしていたことで、同じ案件に
 * 同名の債権者が2行あると後ろの行が丸ごと消えていた（別契約・別枝番など）。
 * generate_realdata_json.py 側は修正済み。このスクリプトは**既に入っている
 * データに対して、足りない行だけを追加**する（全件入れ替えはしない）。
 *
 * 実データでは 23行 / 21案件 が対象。
 *
 * 使い方:
 *   python3 scripts/kintone_ndjson_to_csv.py --out docs/data/kintone/csv
 *   REALDATA_SRC=docs/data/kintone/csv REALDATA_OUT=/tmp/kfix python3 scripts/generate_realdata_json.py
 *   DATA_DIR=/tmp/kfix node scripts/repair_duplicate_creditors.mjs [--dry-run]
 *
 * 何度実行しても安全（すでに足りていれば何もしない）。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

try {
  process.loadEnvFile('.env')
} catch {
  /* 環境変数で渡されていれば動く */
}

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'public', 'data')
const DRY = process.argv.includes('--dry-run')
/**
 * 既定では「DBに既にある債権者名の、足りない行」だけを足す。
 *
 * これを外すと、8/1以降に kintone 側で**名前が変わった**債権者まで
 * 「新しい名前の行が無い」と判定されて追加され、古い名前が残ったまま
 * 二重計上になる。実例:
 *   96885E  メルペイ            → NTS総合弁護士法人（メルペイ）
 *   116755E 楽天カード          → 楽天カード①／楽天カード②
 *   39503W  ニッテレ債権回収(2口分) → ニッテレ債権回収（dカード①）／（dカード②）
 * これらは「追加」ではなく「改称」なので、足してはいけない。
 *
 * --include-new を付けると新しい名前も足す。8/1以降に本当に追加された
 * 債権者を入れたいときだけ使い、改称でないことを目視で確かめること。
 */
const INCLUDE_NEW = process.argv.includes('--include-new')
const prisma = new PrismaClient()

const read = async (name) => JSON.parse(await readFile(join(DATA_DIR, name), 'utf8'))
const d = (v) => (v ? new Date(v) : null)
/** 案件IDと債権者名の組。名前に空白が入るので区切りは \t にする */
const keyOf = (ext, name) => ext + '\t' + name

async function main() {
  const cases = await read('cases.json')
  const creditors = await read('creditors.json')

  const extOf = new Map(cases.map((c) => [c.id, c.metadata?.externalId ?? null]))

  // 生成結果を (externalId, 債権者名) ごとにまとめる
  const wanted = new Map()
  for (const cr of creditors) {
    const ext = extOf.get(cr.caseId)
    if (!ext) continue
    const k = keyOf(ext, cr.creditorName)
    if (!wanted.has(k)) wanted.set(k, [])
    wanted.get(k).push(cr)
  }

  const dbCases = await prisma.case.findMany({ select: { id: true, externalId: true } })
  const idOfExt = new Map(
    dbCases.filter((c) => c.externalId).map((c) => [c.externalId.trim(), c.id])
  )
  const extOfCaseId = new Map(dbCases.map((c) => [c.id, (c.externalId ?? '').trim()]))

  const dbRows = await prisma.creditor.groupBy({
    by: ['caseId', 'creditorName'],
    _count: { _all: true },
  })
  const have = new Map()
  for (const r of dbRows) {
    const ext = extOfCaseId.get(r.caseId)
    if (!ext) continue
    have.set(keyOf(ext, r.creditorName), r._count._all)
  }

  const toAdd = []
  const skippedNew = []
  for (const [k, rows] of wanted) {
    const cur = have.get(k) ?? 0
    if (rows.length <= cur) continue
    const [ext, name] = k.split('\t')
    const caseId = idOfExt.get(ext)
    if (!caseId) continue
    // DBに1行も無い名前は「改称された可能性が高い」ので既定では足さない
    if (cur === 0 && !INCLUDE_NEW) {
      skippedNew.push({ ext, name })
      continue
    }
    for (const cr of rows.slice(cur)) toAdd.push({ ext, name, caseId, cr })
  }

  const caseCount = new Set(toAdd.map((x) => x.ext)).size
  console.log('不足している債権者の行: ' + toAdd.length + ' 件 / ' + caseCount + ' 案件')
  for (const x of toAdd) console.log('  ' + x.ext + ' / ' + x.name)
  if (skippedNew.length > 0) {
    console.log('')
    console.log('▼ DBに同名が無いため見送った行: ' + skippedNew.length + ' 件')
    console.log('   （kintone側で名前が変わった可能性が高く、足すと二重計上になります）')
    for (const x of skippedNew.slice(0, 20)) console.log('  - ' + x.ext + ' / ' + x.name)
    if (skippedNew.length > 20) console.log('  … 他 ' + (skippedNew.length - 20) + ' 件')
    console.log('   本当に新規なら --include-new を付けて実行してください')
  }
  if (DRY || toAdd.length === 0) {
    await prisma.$disconnect()
    return
  }

  // id は JSON 上の連番なので使わず、DBに採番させる
  const data = toAdd.map(({ caseId, cr }) => {
    const rest = { ...cr }
    delete rest.id
    delete rest.caseId
    return {
      ...rest,
      caseId,
      nextProcessDate: d(rest.nextProcessDate),
      acceptanceNoticeSentDate: d(rest.acceptanceNoticeSentDate),
      debtInquiryArrivalDate: d(rest.debtInquiryArrivalDate),
      contractDate: d(rest.contractDate),
      settlementProposalDate: d(rest.settlementProposalDate),
      settlementDate: d(rest.settlementDate),
    }
  })
  const r = await prisma.creditor.createMany({ data })
  console.log('追加しました: ' + r.count + ' 件')
  console.log('creditors 合計: ' + (await prisma.creditor.count()) + ' 件')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
