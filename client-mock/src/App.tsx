import { createBrowserRouter, RouterProvider } from 'react-router-dom'
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
    <CaseProvider>
      <RouterProvider router={router} />
    </CaseProvider>
  )
}
