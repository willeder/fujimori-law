import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { CaseProvider } from './store/CaseStore'
import { CaseListPage, CaseDetailPage } from './pages'

const router = createBrowserRouter([
  {
    path: '/',
    element: <CaseListPage />,
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
