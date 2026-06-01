import type { ReactNode } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { UiFontScaleProvider } from './context/UiFontScaleContext'
import { UserSettingsProvider } from './context/UserSettingsContext'
import { CaseProvider } from './store/CaseStore'
import { useCaseLoading } from './store/useCaseStore'
import {
  CaseListPage,
  CaseDetailPage,
  SettlementResultsPage,
  PaymentManagementPage,
  PaymentDiscrepancyPage,
} from './pages'
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
    path: '/payment-delay',
    element: <PaymentDelayDashboard />,
  },
  {
    path: '/cases/:id',
    element: <CaseDetailPage />,
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
          public/data/ の JSON が存在するか確認してください（再生成:
          scripts/generate_realdata_json.py）
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
        <p className="text-sm text-slate-500">実データを読み込み中…</p>
      </div>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <UiFontScaleProvider>
      <UserSettingsProvider>
        <CaseProvider>
          <DataGate>
            <RouterProvider router={router} />
          </DataGate>
        </CaseProvider>
      </UserSettingsProvider>
    </UiFontScaleProvider>
  )
}
