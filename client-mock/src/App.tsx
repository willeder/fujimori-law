import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { UiFontScaleProvider } from './context/UiFontScaleContext'
import { CaseProvider } from './store/CaseStore'
import {
  CaseListPage,
  CaseDetailPage,
  SettlementResultsPage,
  PaymentManagementPage,
} from './pages'

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
    path: '/cases/:id',
    element: <CaseDetailPage />,
  },
])

export default function App() {
  return (
    <UiFontScaleProvider>
      <CaseProvider>
        <RouterProvider router={router} />
      </CaseProvider>
    </UiFontScaleProvider>
  )
}
