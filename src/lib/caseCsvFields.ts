/**
 * 案件の「全項目」をCSV出力の候補として並べる。
 *
 * 事務所からのご指摘（2026-09-03）:
 *   「出力できるフィールドが特定されてしまっており、全フィールドを
 *     出力できるようにして欲しい」
 *
 * これまでのCSV出力は、そのとき画面に出ている列だけが候補だった（案件一覧の
 * 既定は18列）。案件そのものは112項目あるので、大半が出せない状態だった。
 *
 * ここでは案件の中身を丸ごとたどって、葉になっている項目をすべて候補にする。
 * 項目名は constants/fieldLabels.ts の辞書を使う。同じ名前の項目が別の区分に
 * あるときは「区分：項目名」の形にして区別する（例「和解：ステータス」）。
 */
import { FIELD_LABEL } from '../constants/fieldLabels'
import type { Case } from '../types'

/** 案件の区分（ネストの1段目）の表示名 */
const GROUP_LABEL: Record<string, string> = {
  clientBasicInfo: '依頼者',
  appointmentInfo: '受任',
  debtInfo: '債務',
  settlementInfo: '和解',
  feeInfo: '報酬',
  paymentInfo: '入金',
  reminderInfo: 'リマインド',
  metadata: 'その他',
}

export type CaseField = {
  /** 値を取り出す道順。例 "clientBasicInfo.name" */
  path: string
  /** 画面・CSVの見出し */
  label: string
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

/**
 * 案件1件を見本にして、全項目の道順と見出しを作る。
 * 値が null の項目も候補に残す（その案件で空でも、他の案件では入っているため）。
 */
export function buildCaseFields(sample: Case | undefined): CaseField[] {
  if (!sample) return []
  const found: { path: string; leaf: string; group: string }[] = []
  for (const [group, value] of Object.entries(sample as unknown as Record<string, unknown>)) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      // id など、区分に属さない直下の項目
      found.push({ path: group, leaf: group, group: '' })
      continue
    }
    for (const leaf of Object.keys(value as Record<string, unknown>)) {
      found.push({ path: `${group}.${leaf}`, leaf, group })
    }
  }
  // 同じ項目名が複数の区分にあるかを数え、あるものだけ区分を前に付ける
  const leafCount = new Map<string, number>()
  for (const f of found) leafCount.set(f.leaf, (leafCount.get(f.leaf) ?? 0) + 1)
  return found.map((f) => {
    const name = FIELD_LABEL[f.leaf] ?? f.leaf
    const needGroup = (leafCount.get(f.leaf) ?? 0) > 1 && f.group
    return {
      path: f.path,
      label: needGroup ? `${GROUP_LABEL[f.group] ?? f.group}：${name}` : name,
    }
  })
}

/** CSVに書く文字列にする（配列・オブジェクトは潰す） */
export function csvText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'はい' : 'いいえ'
  if (Array.isArray(v)) return v.map((x) => csvText(x)).join(' / ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
