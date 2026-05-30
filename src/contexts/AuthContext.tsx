import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  clearAuth,
  getStoredAuth,
  loginWithCredentials,
  type AuthUser,
} from '@/lib/auth';
import { AuthContext } from '@/contexts/auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    setUser(getStoredAuth());
    setBooting(false);
  }, []);

  const login = useCallback(async (userName: string, password: string) => {
    const nextUser = await loginWithCredentials(userName, password);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, booting, login, logout }),
    [user, booting, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
