/**
 * Vercel Routing Middleware（Edge）
 *
 * 旧: 全リクエストに固定 Basic 認証 → 撤去。
 * 現: 認証はアプリ内のログイン（/api/auth/*・セッション Cookie）と
 *     各 API Function 側のセッション検証で行う。ここでは素通しする。
 *
 * 将来、共通のセキュリティヘッダ付与やメンテナンスモード等が必要になれば
 * このフックを利用する。
 */
import { next } from '@vercel/functions'

export default function middleware() {
  return next()
}

export const config = {
  matcher: '/:path*',
}
