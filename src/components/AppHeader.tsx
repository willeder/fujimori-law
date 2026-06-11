/**
 * 全画面共通の統一ヘッダー。
 * 上段: アプリ名＋ページ名 / グローバルナビ（PageNav）/ アカウント（フォント・ユーザー・ログアウト）。
 * 下段(任意): 各ページ固有のツールバー（検索・フィルタ等）を children として表示。
 *
 * ログイン情報をこのヘッダー内（通常フロー）に置くことで、
 * 従来の固定オーバーレイによる本文との重なりを解消する。
 */
import type { ReactNode } from 'react'
import { UiFontScaleControl } from './UiFontScaleControl'
import { PageNav } from './PageNav'
import { FindModeLauncher } from './case/FindModeLauncher'
import { useAuth } from '../context/AuthContext'

export function AppHeader({
  title,
  children,
}: {
  title?: ReactNode
  children?: ReactNode
}) {
  const { user, logout } = useAuth()
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="whitespace-nowrap text-base font-bold text-slate-800">
          受任案件管理
          {title ? (
            <span className="ml-2 text-xs font-normal text-slate-500">{title}</span>
          ) : null}
        </h1>

        <div className="flex shrink-0 items-center gap-2">
          <FindModeLauncher />
          <UiFontScaleControl variant="select" />
          {user && (
            <>
              <span className="text-xs font-medium text-slate-700">
                {user.name ?? user.email}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                {user.role === 'ADMIN' ? '管理者' : 'スタッフ'}
              </span>
              {user.role === 'ADMIN' && (
                <a
                  href="/members"
                  className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  メンバー管理
                </a>
              )}
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              >
                ログアウト
              </button>
            </>
          )}
        </div>
      </div>
      {/* メニューは専用行に固定。サブタイトル長に左右されず常に同じ位置 */}
      <div className="mt-2">
        <PageNav />
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </header>
  )
}
