import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppDocumentTitle } from '@/components/AppDocumentTitle';
import { GuestRoute, ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GroupMonitoringPage } from '@/pages/GroupMonitoringPage';
import { AdminPage } from '@/pages/AdminPage';
import { LoginPage } from '@/pages/LoginPage';
export default function App() {
  return (
    <HashRouter>
      <AppDocumentTitle />
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route index element={<GroupMonitoringPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="settings" element={<Navigate to="/admin" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
