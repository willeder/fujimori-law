import type { ReactNode } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { UiFontScaleProvider } from './context/UiFontScaleContext'
import { UserSettingsProvider } from './context/UserSettingsContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CaseProvider } from './store/CaseStore'
import { useCaseLoading } from './store/useCaseStore'
import {
  CaseListPage,
  CaseDetailPage,
  SettlementResultsPage,
  PaymentManagementPage,
  PaymentDiscrepancyPage,
  PaymentReminderPage,
} from './pages'
import { LoginPage } from './pages/LoginPage'
import { MembersPage } from './pages/MembersPage'
import { GmoTransferPage } from './pages/GmoTransferPage'
import { IntakeImportPage } from './pages/IntakeImportPage'
import { PaymentDelayDashboard } from './pages/PaymentDelayDashboard'

const router = createBrowserRouter([
  {
    path: '/',
    element: <CaseListPage />,
  },
  {
    path: '/settlement-results',
    element: <SettlementResultsPage />,
  },
  {
    path: '/payment-management',
    element: <PaymentManagementPage />,
  },
  {
    path: '/payment-discrepancy',
    element: <PaymentDiscrepancyPage />,
  },
  {
    path: '/payment-reminder',
    element: <PaymentReminderPage />,
  },
  {
    path: '/payment-delay',
    element: <PaymentDelayDashboard />,
  },
  {
    path: '/cases/:id',
    element: <CaseDetailPage />,
  },
  {
    path: '/members',
    element: <MembersPage />,
  },
  {
    path: '/gmo-transfer',
    element: <GmoTransferPage />,
  },
  {
    path: '/intake-import',
    element: <IntakeImportPage />,
  },
])

function DataGate({ children }: { children: ReactNode }) {
  const { loading, loadError } = useCaseLoading()

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 p-6 text-center">
        <p className="text-lg font-semibold text-red-700">
          データの読み込みに失敗しました
        </p>
        <p className="text-sm text-slate-500">{loadError}</p>
        <p className="text-xs text-slate-400">
          API（/api/cases）への接続を確認してください。多くは DB 接続不可、
          またはセッション切れ（再ログイン）が原因です。
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 rounded bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          再読み込み
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
        <p className="text-sm text-slate-500">実データを読み込み中…</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-xs text-slate-400 underline hover:text-slate-600"
        >
          時間がかかる場合は再読み込み
        </button>
      </div>
    )
  }

  return <>{children}</>
}

/** 認証ゲート: 未ログインはログイン画面、確認中はスピナー */
function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
        <p className="text-sm text-slate-500">認証を確認中…</p>
      </div>
    )
  }

  if (!user) return <LoginPage />

  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <UiFontScaleProvider>
          <UserSettingsProvider>
            <CaseProvider>
              <DataGate>
                <RouterProvider router={router} />
              </DataGate>
            </CaseProvider>
          </UserSettingsProvider>
        </UiFontScaleProvider>
      </AuthGate>
    </AuthProvider>
  )
}
