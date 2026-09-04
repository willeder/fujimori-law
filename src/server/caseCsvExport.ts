/**
 * 案件＋サブテーブルのCSV出力（kintone のエクスポートと同じ形）。
 *
 * 事務所からのご指摘・ご指定（2026-09-03）:
 *   「出力できるフィールドが特定されてしまっており、全フィールドを出力できる
 *     ようにして欲しい。テーブルがある場合は、そのテーブルを指定すると、
 *     テーブル内の全フィールドを出力するなど（kintoneと同様）」
 *   出力の形:
 *     ・1行＝テーブルの1行。先頭に案件の項目を付ける
 *     ・複数テーブルを選んだときは、1つ目のテーブルが終わったあと別テーブルが
 *       始まる。別テーブルの列は空欄にする
 *   対象: 全件（絞り込みなし）
 *
 * 列の並び:
 *   [案件の項目...] [債権者の項目...] [入金の項目...] [接触履歴の項目...]
 * 行の出し方（案件ごと）:
 *   債権者の行を全部 → 入金の行を全部 → 接触履歴の行を全部
 *   その行が属さないテーブルの列は空欄。
 *   どのテーブルにも行が無い案件は、案件の項目だけの行を1行出す
 *   （出力から案件が消えてしまわないように）。
 *
 * 件数が多いので、案件を少しずつ読みながら書き出す（一度に全部は載せない）。
 */
import { prisma } from './db.js'

export type TableKey = 'creditor' | 'payment' | 'contact'

export interface ExportRequest {
  /** 案件側に出す項目の道順（例 "clientBasicInfo.name"）。空なら案件の列は出さない */
  caseFields: string[]
  /** テーブルごとに出す項目名（DBの列名）。空配列・未指定のテーブルは出さない */
  tables: Partial<Record<TableKey, string[]>>
  /**
   * 出力する案件を絞る（案件の内部ID）。省略・空なら全件。
   *
   * 事務所からのご要望（2026-09-03）:
   *   「特定案件のみを絞込み、該当案件だけをCSV出力し、出力時に出力するフィールド
   *     （もしくはテーブル）を選択できるようにしてほしい」
   * これまでテーブルを選ぶと全件固定で、画面の絞り込みが効いていなかった。
   * 画面がいま表示している案件のIDをそのまま受け取り、それだけを出す。
   */
  caseIds?: number[]
}

const esc = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** 値をCSVの文字列にする */
export function cell(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'boolean') return v ? 'はい' : 'いいえ'
  if (Array.isArray(v)) return v.map((x) => cell(x)).join(' / ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 道順で値を取り出す */
export function valueAtPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

const TABLE_ORDER: TableKey[] = ['creditor', 'payment', 'contact']

/**
 * CSVを少しずつ作って渡す。
 * write に渡ってきた文字列をそのまま流していけばCSVになる。
 */
export async function streamCaseCsv(
  req: ExportRequest,
  toCaseJson: (row: Record<string, unknown>) => Record<string, unknown>,
  labelOf: (kind: 'case' | TableKey, field: string) => string,
  write: (chunk: string) => void | Promise<void>
): Promise<{ cases: number; rows: number }> {
  /*
    突合用の内部IDは、選ばれていなくても必ず先頭に入れる（事務所と確認 2026-09-03）。
    取り込むときに「どの行のことか」を決められるのはこの列だけ。
    ID（118823E 等）や氏名は事務所側で直されることがあり、キーにできない。
  */
  const caseFields = ['id', ...(req.caseFields ?? []).filter((f) => f !== 'id')]
  const used = TABLE_ORDER.filter((t) => (req.tables?.[t]?.length ?? 0) > 0)
  const tableFields: Partial<Record<TableKey, string[]>> = {}
  for (const t of used) {
    tableFields[t] = ['id', ...(req.tables[t] ?? []).filter((f) => f !== 'id')]
  }

  // 見出し
  const header = [
    ...caseFields.map((f) => labelOf('case', f)),
    ...used.flatMap((t) => (tableFields[t] ?? []).map((f) => labelOf(t, f))),
  ]
  // Excel で文字化けしないよう UTF-8 BOM
  await write('﻿' + header.map(esc).join(',') + '\r\n')

  // テーブルごとの列位置（選んでいないテーブルのぶんは詰めない）
  const offset: Partial<Record<TableKey, number>> = {}
  let at = caseFields.length
  for (const t of used) {
    offset[t] = at
    at += (tableFields[t] ?? []).length
  }
  const width = at

  let caseCount = 0
  let rowCount = 0
  const BATCH = 200
  let cursor = 0
  // 絞り込みが指定されていればその案件だけ。指定が無ければ全件。
  const only = req.caseIds && req.caseIds.length > 0 ? req.caseIds : null

  for (;;) {
    const cases = await prisma.case.findMany({
      where: only ? { id: { gt: cursor, in: only } } : { id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: BATCH,
    })
    if (cases.length === 0) break
    cursor = cases[cases.length - 1].id
    const ids = cases.map((c) => c.id)

    const [creditors, payments, contacts] = await Promise.all([
      used.includes('creditor')
        ? prisma.creditor.findMany({ where: { caseId: { in: ids } }, orderBy: { id: 'asc' } })
        : Promise.resolve([] as Record<string, unknown>[]),
      used.includes('payment')
        ? prisma.payment.findMany({ where: { caseId: { in: ids } }, orderBy: { id: 'asc' } })
        : Promise.resolve([] as Record<string, unknown>[]),
      used.includes('contact')
        ? prisma.contactHistory.findMany({ where: { caseId: { in: ids } }, orderBy: { id: 'asc' } })
        : Promise.resolve([] as Record<string, unknown>[]),
    ])
    const group = (rows: Record<string, unknown>[]) => {
      const m = new Map<number, Record<string, unknown>[]>()
      for (const r of rows) {
        const k = Number(r.caseId)
        const arr = m.get(k)
        if (arr) arr.push(r)
        else m.set(k, [r])
      }
      return m
    }
    const byCase: Record<TableKey, Map<number, Record<string, unknown>[]>> = {
      creditor: group(creditors as Record<string, unknown>[]),
      payment: group(payments as Record<string, unknown>[]),
      contact: group(contacts as Record<string, unknown>[]),
    }

    let buf = ''
    for (const c of cases) {
      caseCount += 1
      const json = toCaseJson(c as unknown as Record<string, unknown>)
      const head = caseFields.map((f) => esc(cell(valueAtPath(json, f))))

      let wrote = false
      for (const t of used) {
        const rows = byCase[t].get(c.id) ?? []
        const fields = tableFields[t] ?? []
        const start = offset[t]!
        for (const r of rows) {
          const line: string[] = new Array(width).fill('')
          for (let i = 0; i < head.length; i++) line[i] = head[i]
          for (let i = 0; i < fields.length; i++) line[start + i] = esc(cell(r[fields[i]]))
          buf += line.join(',') + '\r\n'
          rowCount += 1
          wrote = true
        }
      }
      // どのテーブルにも行が無い案件も1行は出す（案件が消えないように）
      if (!wrote) {
        const line: string[] = new Array(width).fill('')
        for (let i = 0; i < head.length; i++) line[i] = head[i]
        buf += line.join(',') + '\r\n'
        rowCount += 1
      }
    }
    await write(buf)
  }
  return { cases: caseCount, rows: rowCount }
}
