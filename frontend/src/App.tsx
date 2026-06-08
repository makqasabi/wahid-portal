import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import LoginPage from '@/pages/LoginPage';
import { Spinner } from '@/components/ui/Spinner';

// Lazy-loaded route pages — splits heavy deps (e.g. recharts on the dashboard)
// out of the initial bundle so first paint stays light.
const AuthCallbackPage = lazy(() => import('@/pages/AuthCallbackPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const TicketListPage = lazy(() => import('@/pages/TicketListPage'));
const TicketDetailPage = lazy(() => import('@/pages/TicketDetailPage'));
const TicketCreatePage = lazy(() => import('@/pages/TicketCreatePage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));

function RouteFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

function App() {
  return (
    <>
      <Toaster position="top-right" />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tickets" element={<TicketListPage />} />
            <Route path="/tickets/create" element={<TicketCreatePage />} />
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
            <Route path="/tickets/:id/edit" element={<TicketCreatePage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
