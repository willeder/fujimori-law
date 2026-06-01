import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '受任案件管理',
  description: '藤森法律事務所 受任案件管理システム',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
