import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { LoadingState } from '@/components/DataStates'
import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Toaster } from '@/components/ui/sonner'
import { queryClient } from '@/lib/queryClient'

// Tách theo route để giảm kích thước bundle ban đầu.
const LoginPage = lazy(() =>
  import('@/features/auth/LoginPage').then((module) => ({
    default: module.LoginPage,
  })),
)
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
)
const AccountsPage = lazy(() =>
  import('@/features/accounts/AccountsPage').then((module) => ({
    default: module.AccountsPage,
  })),
)
const PartiesPage = lazy(() =>
  import('@/features/parties/PartiesPage').then((module) => ({
    default: module.PartiesPage,
  })),
)
const JournalsPage = lazy(() =>
  import('@/features/journals/JournalsPage').then((module) => ({
    default: module.JournalsPage,
  })),
)
const FiscalPeriodsPage = lazy(() =>
  import('@/features/periods/FiscalPeriodsPage').then((module) => ({
    default: module.FiscalPeriodsPage,
  })),
)
const InvoicesPage = lazy(() =>
  import('@/features/invoices/InvoicesPage').then((module) => ({
    default: module.InvoicesPage,
  })),
)
const BillsPage = lazy(() =>
  import('@/features/bills/BillsPage').then((module) => ({
    default: module.BillsPage,
  })),
)
const PaymentsPage = lazy(() =>
  import('@/features/payments/PaymentsPage').then((module) => ({
    default: module.PaymentsPage,
  })),
)
const AgingPage = lazy(() =>
  import('@/features/receivables/AgingPage').then((module) => ({
    default: module.AgingPage,
  })),
)
const LedgerPage = lazy(() =>
  import('@/features/ledger/LedgerPage').then((module) => ({
    default: module.LedgerPage,
  })),
)
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((module) => ({
    default: module.ReportsPage,
  })),
)
const AuditPage = lazy(() =>
  import('@/features/audit/AuditPage').then((module) => ({
    default: module.AuditPage,
  })),
)
const UsersPage = lazy(() =>
  import('@/features/users/UsersPage').then((module) => ({
    default: module.UsersPage,
  })),
)
const ProfilePage = lazy(() =>
  import('@/features/profile/ProfilePage').then((module) => ({
    default: module.ProfilePage,
  })),
)
const JobsPage = lazy(() =>
  import('@/features/jobs/JobsPage').then((module) => ({
    default: module.JobsPage,
  })),
)
const NotificationsPage = lazy(() =>
  import('@/features/notifications/NotificationsPage').then((module) => ({
    default: module.NotificationsPage,
  })),
)
const WebhooksPage = lazy(() =>
  import('@/features/webhooks/WebhooksPage').then((module) => ({
    default: module.WebhooksPage,
  })),
)

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<LoadingState />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<DashboardPage />} />
                <Route path="journals" element={<JournalsPage />} />
                <Route path="invoices" element={<InvoicesPage />} />
                <Route path="bills" element={<BillsPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="receivables" element={<AgingPage />} />
                <Route path="periods" element={<FiscalPeriodsPage />} />
                <Route path="ledger" element={<LedgerPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="parties" element={<PartiesPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="jobs" element={<JobsPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route
                  path="webhooks"
                  element={<ProtectedRoute roles={['admin']} />}
                >
                  <Route index element={<WebhooksPage />} />
                </Route>
                <Route
                  path="users"
                  element={<ProtectedRoute roles={['admin']} />}
                >
                  <Route index element={<UsersPage />} />
                </Route>
                <Route
                  path="audit"
                  element={<ProtectedRoute roles={['admin']} />}
                >
                  <Route index element={<AuditPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
