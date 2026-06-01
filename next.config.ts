import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 入金 18 万行など大きめのレスポンスを返す API があるため緩めに
  experimental: {},
}

export default nextConfig
