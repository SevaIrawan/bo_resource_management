import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  permissionsForRole,
  resolveAppRoleFromUsername,
  type AppPermissions,
} from '@/lib/userRole';

export function usePermissions(): AppPermissions {
  const { user } = useAuth();
  return useMemo(() => {
    const role = resolveAppRoleFromUsername(user?.userName ?? '');
    return permissionsForRole(role);
  }, [user?.userName]);
}
