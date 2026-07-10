/**
 * 住所表示ユーティリティ
 *
 * 都道府県と住所を連結して表示する際、住所側にすでに都道府県が
 * 含まれている場合に二重表示（例:「東京都東京都新宿区…」）に
 * ならないようにする。（修正依頼 No.167）
 */
export function joinAddress(
  prefecture: string | null | undefined,
  address: string | null | undefined,
): string {
  const pref = (prefecture ?? '').trim()
  const addr = (address ?? '').trim()
  if (!pref) return addr
  if (!addr) return pref
  // 住所がすでに都道府県から始まっている場合はそのまま返す
  if (addr.startsWith(pref)) return addr
  return pref + addr
}

/**
 * 住所文字列から先頭の都道府県を取り除く（DB格納値の正規化用）。
 * 都道府県フィールドと住所フィールドを分離して保持する設計のため、
 * 取込み時に住所へ都道府県が重複して入っていた場合に除去する。
 */
export function stripPrefecture(
  prefecture: string | null | undefined,
  address: string | null | undefined,
): string {
  const pref = (prefecture ?? '').trim()
  const addr = (address ?? '').trim()
  if (!pref || !addr) return addr
  if (addr.startsWith(pref)) return addr.slice(pref.length).trim()
  return addr
}
