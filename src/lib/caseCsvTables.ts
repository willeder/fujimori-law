/**
 * CSV出力でテーブル（債権者・入金・接触履歴）も出すための定義と、出力の実行。
 *
 * 事務所のご指定（2026-09-03）:
 *   「テーブルがある場合は、そのテーブルを指定すると、テーブル内の全フィールドを
 *     出力するなど（kintoneと同様）」
 *   ・1行＝テーブルの1行。先頭に案件の項目を付ける
 *   ・複数テーブルのときは、1つ目が終わったあと次のテーブルが始まる。
 *     その行では他のテーブルの列は空欄
 *   ・対象は全件
 *
 * テーブルのデータは案件一覧に読み込んでいない（入金だけで19.6万行ある）ので、
 * サーバでCSVを組み立てて、そのまま受け取って保存する。
 */
import { FIELD_LABEL } from '../constants/fieldLabels'
import {
  CONTACT_FIELDS,
  CREDITOR_FIELDS,
  PAYMENT_FIELDS,
} from '../constants/csvColumns'

/*
  出せる項目の一覧（CREDITOR_FIELDS / PAYMENT_FIELDS / CONTACT_FIELDS）は
  constants/csvColumns.ts に置いてある。出力・取込・この画面の3か所で同じものを
  使わないと「出したCSVが取り込めない」ことになるため、写経せず共有している。
*/

const label = (f: string) => FIELD_LABEL[f] ?? f
const toFields = (keys: string[]) => keys.map((k) => ({ key: k, label: label(k) }))

export const CSV_TABLES = [
  { key: 'creditor', label: '債権者（和解状況）', fields: toFields(CREDITOR_FIELDS) },
  { key: 'payment', label: '入金スケジュール', fields: toFields(PAYMENT_FIELDS) },
  { key: 'contact', label: '接触履歴', fields: toFields(CONTACT_FIELDS) },
]

/**
 * サーバでCSVを作ってもらい、保存する。
 *
 * サーバはCSV本体ではなく「期限付きのダウンロードURL」を返す（2026-09-08 に変更）。
 * 実データでのCSVは 債権者5.7MB / 入金18.3MB / 接触履歴23.1MB あり、
 * 本体をそのまま返すやり方では Vercel の応答上限 4.5MB を超えて
 * 「CSVを作成できませんでした」になっていた。
 * いまはCSV本体を非公開の保管場所に置き、そこから直接ダウンロードする。
 * URLは期限付き（10分）で、期限が切れれば誰も開けない。
 */
type ExportResponse = {
  url: string
  fileName: string
  bytes: number
  cases: number
  rows: number
  expiresAt: string
}

export async function downloadCaseCsvWithTables(sel: {
  caseFields: string[]
  tables: Record<string, string[]>
  ids: (string | number)[]
}): Promise<void> {
  // 画面の絞り込み結果（案件の内部ID）をそのまま渡し、その案件だけを出す
  const caseIds = sel.ids.map((v) => Number(v)).filter((n) => Number.isFinite(n))
  let r: Response
  try {
    r = await fetch('/api/cases/export-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseFields: sel.caseFields, tables: sel.tables, caseIds }),
    })
  } catch {
    window.alert('CSVを作成できませんでした（通信に失敗しました）')
    return
  }
  // 何が起きたか分かるように、サーバからの理由をそのまま見せる
  if (!r.ok) {
    let reason = `HTTP ${r.status}`
    try {
      const e = (await r.json()) as { error?: string }
      if (e?.error) reason = e.error
    } catch {
      /* JSON でなければステータスだけ出す */
    }
    window.alert(`CSVを作成できませんでした\n${reason}`)
    return
  }
  const data = (await r.json()) as ExportResponse
  if (!data?.url) {
    window.alert('CSVを作成できませんでした（ダウンロード先が返りませんでした）')
    return
  }
  // 保管場所から直接ダウンロードする（アプリのサーバを通さない）
  const a = document.createElement('a')
  a.href = data.url
  a.download = data.fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
