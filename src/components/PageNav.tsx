/**
 * 全画面共通のグローバルナビ。各ダッシュボード間を直接移動できるようにする。
 * 各一覧はボタン（枠囲み）で表示し、現在開いている一覧は背景色を変えて明示する。
 */
import { useLocation, useNavigate } from 'react-router-dom'

const LINKS: { path: string; label: string }[] = [
  { path: '/', label: '案件一覧' },
  { path: '/payment-management', label: '入金管理一覧' },
  { path: '/payment-delay', label: '入金遅延モニタリング' },
  { path: '/payment-reminder', label: '入金催促' },
  { path: '/settlement-results', label: '和解実績一覧' },
  { path: '/payment-discrepancy', label: '入金額相違一覧' },
  { path: '/reminder-client', label: '依頼者リマインド' },
  { path: '/reminder-creditor', label: '債権者リマインド' },
  { path: '/gmo-transfer', label: 'GMO振込出力' },
  { path: '/intake-import', label: '相談票取込' },
]

export function PageNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (
    <nav className="flex flex-wrap items-center gap-1.5">
      {LINKS.map((l) => {
        const active = pathname === l.path
        return (
          <button
            key={l.path}
            type="button"
            onClick={() => navigate(l.path)}
            disabled={active}
            aria-current={active ? 'page' : undefined}
            className={
              'rounded-md border px-2.5 py-1 text-xs transition-colors ' +
              (active
                ? 'cursor-default border-blue-600 bg-blue-600 font-semibold text-white shadow-sm'
                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900')
            }
          >
            {l.label}
          </button>
        )
      })}
    </nav>
  )
}
