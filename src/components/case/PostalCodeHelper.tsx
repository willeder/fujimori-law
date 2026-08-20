/**
 * 郵便番号の入力補助（修正依頼「郵便番号は運用上も入れてほしい」）。
 *
 * 郵便番号の欄の下に小さく出す。
 *   郵便番号が入っていて住所が空 … 「住所を入れる」
 *   住所が入っていて郵便番号が空 … 「郵便番号を引く」→ 候補から選ぶ
 *
 * どちらも**勝手には確定させない**。押したときだけ入る。
 * 住所からの逆引きは似た町名で取り違える可能性があるため、候補が複数なら選ばせる。
 * 辞書はサーバ側にあり、外部サービスへは問い合わせない。
 */
import { useState } from 'react'

type PostalHit = {
  zipcode: string
  prefecture: string
  city: string
  town: string
  address: string
}

const fmtZip = (z: string) => (z.length === 7 ? `${z.slice(0, 3)}-${z.slice(3)}` : z)

export function PostalCodeHelper({
  postalCode,
  prefecture,
  address,
  onApplyAddress,
  onApplyZip,
  disabled = false,
}: {
  postalCode: string
  prefecture: string
  address: string
  /** 郵便番号から住所を入れる（都道府県と、市区町村＋町域） */
  onApplyAddress: (prefecture: string, rest: string) => void
  /** 住所から郵便番号を入れる */
  onApplyZip: (zip: string) => void
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [candidates, setCandidates] = useState<PostalHit[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const zipDigits = (postalCode ?? '').replace(/[^0-9]/g, '')
  const hasZip = zipDigits.length === 7
  const hasAddress = (address ?? '').trim().length > 0 || (prefecture ?? '').trim().length > 0

  const fillAddress = async () => {
    setBusy(true)
    setMessage(null)
    setCandidates(null)
    try {
      const r = await fetch(`/api/postal/zip?code=${encodeURIComponent(zipDigits)}`)
      const d = (await r.json()) as { hits?: PostalHit[] }
      const hit = d.hits?.[0]
      if (!hit) {
        setMessage('その郵便番号は見つかりませんでした')
        return
      }
      onApplyAddress(hit.prefecture, `${hit.city}${hit.town}`)
    } catch {
      setMessage('郵便番号を調べられませんでした')
    } finally {
      setBusy(false)
    }
  }

  const findZip = async () => {
    setBusy(true)
    setMessage(null)
    setCandidates(null)
    try {
      const full = `${prefecture ?? ''}${address ?? ''}`
      const r = await fetch(`/api/postal/address?address=${encodeURIComponent(full)}`)
      const d = (await r.json()) as { hits?: PostalHit[] }
      const hits = d.hits ?? []
      if (hits.length === 0) {
        setMessage('住所から郵便番号を特定できませんでした。手入力をお願いします')
        return
      }
      if (hits.length === 1) {
        onApplyZip(fmtZip(hits[0].zipcode))
        return
      }
      // 複数見つかったときは選ばせる（似た町名の取り違えを避けるため）
      setCandidates(hits)
    } catch {
      setMessage('郵便番号を調べられませんでした')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-0.5 space-y-0.5">
      <div className="flex flex-wrap items-center gap-1">
        {hasZip && (
          <button
            type="button"
            onClick={() => void fillAddress()}
            disabled={disabled || busy}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            title="郵便番号から都道府県・市区町村・町域を入れます"
          >
            住所を入れる
          </button>
        )}
        {!hasZip && hasAddress && (
          <button
            type="button"
            onClick={() => void findZip()}
            disabled={disabled || busy}
            className="rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 hover:bg-blue-100 disabled:opacity-40"
            title="住所から郵便番号の候補を探します"
          >
            郵便番号を引く
          </button>
        )}
        {busy && <span className="text-[10px] text-slate-400">調べています…</span>}
        {message && <span className="text-[10px] text-amber-700">{message}</span>}
      </div>

      {candidates && (
        <div className="rounded border border-blue-200 bg-blue-50 p-1">
          <div className="mb-0.5 text-[10px] text-blue-800">
            候補が{candidates.length}件あります。正しいものを選んでください
          </div>
          <ul className="space-y-0.5">
            {candidates.map((h) => (
              <li key={h.zipcode}>
                <button
                  type="button"
                  onClick={() => {
                    onApplyZip(fmtZip(h.zipcode))
                    setCandidates(null)
                  }}
                  className="w-full rounded px-1 py-0.5 text-left text-[10px] text-slate-700 hover:bg-white"
                >
                  <span className="font-bold tabular-nums">{fmtZip(h.zipcode)}</span>
                  <span className="ml-1 text-slate-500">{h.address}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
