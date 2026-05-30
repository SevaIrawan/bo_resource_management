import { createContext } from 'react';
import type { AuthUser } from '@/lib/auth';

export interface AuthContextValue {
  user: AuthUser | null;
  booting: boolean;
  login: (userName: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
