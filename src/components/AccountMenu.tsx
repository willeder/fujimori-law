/**
 * 右上のアカウントチップ。ログイン中ユーザー名・ロールとログアウト。
 */
import { useAuth } from '../context/AuthContext'

const ROLE_LABEL: Record<'ADMIN' | 'STAFF', string> = {
  ADMIN: '管理者',
  STAFF: 'スタッフ',
}

export function AccountMenu() {
  const { user, logout } = useAuth()
  if (!user) return null

  return (
    <div className="fixed right-3 top-3 z-[100] flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur">
      <span className="text-xs font-medium text-slate-700">
        {user.name ?? user.email}
      </span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.625rem] text-slate-600">
        {ROLE_LABEL[user.role]}
      </span>
      {user.role === 'ADMIN' && (
        <a
          href="/members"
          className="rounded border border-slate-300 px-2 py-0.5 text-[0.6875rem] font-medium text-slate-600 hover:bg-slate-50"
        >
          メンバー管理
        </a>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        className="rounded border border-slate-300 px-2 py-0.5 text-[0.6875rem] font-medium text-slate-600 hover:bg-slate-50"
      >
        ログアウト
      </button>
    </div>
  )
}
