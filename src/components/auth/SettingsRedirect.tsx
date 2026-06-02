import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';

export function SettingsRedirect() {
  const { isAdmin } = usePermissions();
  return <Navigate to={isAdmin ? '/admin' : '/'} replace />;
}
