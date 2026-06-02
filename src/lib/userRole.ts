/** Hak akses ditentukan oleh username login — bukan kolom `role` terpisah. */
export type AppRole = 'admin' | 'operator';

/** Username admin (case-insensitive). Selain ini → operator. */
export const ADMIN_USERNAME = 'admin';

export function resolveAppRoleFromUsername(userName: string): AppRole {
  if (userName.trim().toLowerCase() === ADMIN_USERNAME) return 'admin';
  return 'operator';
}

export function isAppAdmin(role: AppRole): boolean {
  return role === 'admin';
}

export interface AppPermissions {
  role: AppRole;
  isAdmin: boolean;
  canManageStructure: boolean;
  canOperatePlatform: boolean;
  canAutoSync: boolean;
  canAdminSettings: boolean;
}

export function permissionsForRole(role: AppRole): AppPermissions {
  const isAdmin = isAppAdmin(role);
  return {
    role,
    isAdmin,
    canManageStructure: isAdmin,
    canOperatePlatform: isAdmin,
    canAutoSync: isAdmin,
    canAdminSettings: isAdmin,
  };
}
