export const dynamic = 'force-dynamic'

/**
 * この Next.js アプリは API 専用。画面は client-mock（Vite SPA）側で提供する。
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-lg font-bold">受任案件管理 — API サーバ</h1>
      <p className="mb-4 text-sm text-slate-600">
        画面は client-mock（Vite）側。本サーバは DB 接続の API を提供します。
      </p>
      <ul className="list-inside list-disc text-sm text-blue-700">
        <li><a className="hover:underline" href="/api/cases">/api/cases</a></li>
        <li><a className="hover:underline" href="/api/creditors">/api/creditors</a></li>
        <li><a className="hover:underline" href="/api/payments">/api/payments</a></li>
        <li><a className="hover:underline" href="/api/contact-histories">/api/contact-histories</a></li>
      </ul>
    </main>
  )
}
