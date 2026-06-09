/**
 * 全画面共通のグローバルナビ。各ダッシュボード間を直接移動できるようにする。
 */
import { Fragment } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const LINKS: { path: string; label: string }[] = [
  { path: '/', label: '案件一覧' },
  { path: '/payment-management', label: '入金管理一覧' },
  { path: '/payment-delay', label: '入金遅延モニタリング' },
  { path: '/settlement-results', label: '和解実績一覧' },
  { path: '/payment-discrepancy', label: '入金額相違一覧' },
  { path: '/gmo-transfer', label: 'GMO振込出力' },
  { path: '/intake-import', label: '相談票取込' },
]

export function PageNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (
    <nav className="flex flex-wrap items-center gap-2">
      {LINKS.map((l, i) => {
        const active = pathname === l.path
        return (
          <Fragment key={l.path}>
            {i > 0 && <span className="text-slate-300">|</span>}
            <button
              type="button"
              onClick={() => navigate(l.path)}
              disabled={active}
              className={
                active
                  ? 'text-xs font-semibold text-slate-400'
                  : 'text-xs text-slate-600 hover:text-slate-900'
              }
            >
              {l.label}
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}
