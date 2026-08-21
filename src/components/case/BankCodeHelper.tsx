/**
 * 金融機関コード・支店コードの入力補助（修正依頼⑯）。
 *
 * 振込先銀行名／振込先支店名の欄の下に小さく出します。
 *   銀行名が入っていてコードが空 … 「コードを引く」→ 候補から選ぶ
 *   支店名が入っていてコードが空 … 同上（銀行が特定できているときだけ）
 *
 * **勝手には確定させません。** 押して、候補を選んだときだけ入ります。
 * 1件に絞れた場合もそのまま入れず、いったん候補として見せてから選んでいただきます。
 * （旧行名や誤字で別の銀行が当たることがあるため。例：八十二銀行 → 八十二長野銀行）
 *
 * 辞書はサーバ側（zengin-code）にあり、外部サービスへは問い合わせません。
 */
import { useState } from 'react'

type Hit = { code: string; name: string; kana: string }

export function BankCodeHelper({
  /** 'bank' … 銀行名からコードを引く / 'branch' … 支店名からコードを引く */
  kind,
  /** 検索語（振込先銀行名 または 振込先支店名） */
  name,
  /** すでに入っているコード（入っていれば案内を出さない） */
  code,
  /** kind='branch' のときに必要。銀行が決まっていないと支店は絞れない */
  bankCode,
  /** 候補を選んだとき。名前を辞書の表記に揃えるかは呼び出し側で決める */
  onApply,
  disabled = false,
}: {
  kind: 'bank' | 'branch'
  name: string
  code: string
  bankCode?: string
  onApply: (hit: Hit) => void
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [candidates, setCandidates] = useState<Hit[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const hasName = (name ?? '').trim().length > 0
  const hasCode = (code ?? '').trim().length > 0
  const bankReady = (bankCode ?? '').replace(/[^0-9]/g, '').length > 0
  const label = kind === 'bank' ? '金融機関コード' : '支店コード'

  // 銀行名が空、もしくは既にコードが入っているときは出さない。
  // 支店は銀行が決まっていないと引けない。
  if (!hasName || hasCode) return null
  if (kind === 'branch' && !bankReady) return null

  const find = async () => {
    setBusy(true)
    setMessage(null)
    setCandidates(null)
    try {
      const url =
        kind === 'bank'
          ? `/api/bank/search?q=${encodeURIComponent(name)}`
          : `/api/bank/branches?code=${encodeURIComponent(bankCode ?? '')}&q=${encodeURIComponent(name)}`
      const r = await fetch(url)
      const d = (await r.json()) as { hits?: Hit[] }
      const hits = d.hits ?? []
      if (hits.length === 0) {
        setMessage(
          kind === 'bank'
            ? '該当する金融機関が見つかりませんでした。手入力をお願いします'
            : 'この金融機関に該当する支店が見つかりませんでした。手入力をお願いします',
        )
        return
      }
      setCandidates(hits)
    } catch {
      setMessage(`${label}を調べられませんでした`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-0.5 space-y-0.5">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => void find()}
          disabled={disabled || busy}
          className="rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 hover:bg-blue-100 disabled:opacity-40"
          title={`${name} から${label}の候補を探します`}
        >
          {label}を引く
        </button>
        {busy && <span className="text-[10px] text-slate-400">調べています…</span>}
        {message && <span className="text-[10px] text-amber-700">{message}</span>}
      </div>

      {candidates && (
        <div className="rounded border border-blue-200 bg-blue-50 p-1">
          <div className="mb-0.5 flex items-center justify-between gap-1">
            <span className="text-[10px] text-blue-800">
              候補{candidates.length}件。正しいものを選んでください
            </span>
            <button
              type="button"
              onClick={() => setCandidates(null)}
              className="text-[10px] text-slate-500 hover:text-slate-700"
            >
              閉じる
            </button>
          </div>
          <ul className="max-h-44 space-y-0.5 overflow-y-auto">
            {candidates.map((h) => (
              <li key={h.code}>
                <button
                  type="button"
                  onClick={() => {
                    onApply(h)
                    setCandidates(null)
                  }}
                  className="w-full rounded px-1 py-0.5 text-left text-[10px] text-slate-700 hover:bg-white"
                >
                  <span className="font-bold tabular-nums">{h.code}</span>
                  <span className="ml-1">{h.name}</span>
                  {h.kana && <span className="ml-1 text-slate-400">{h.kana}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
