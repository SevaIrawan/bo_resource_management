import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { TABLES } from '@/config/tables';

export const AUTH_STORAGE_KEY = 'rm-auth';

/** Kolom login di tabel public.users (existing Supabase) */
export const USER_LOGIN_COLUMNS = {
  username: 'username',
  password: 'password',
} as const;

export interface AuthUser {
  id: string;
  userName: string;
}

export function getStoredAuth(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (!parsed?.id || !parsed?.userName) return null;

    return {
      id: String(parsed.id),
      userName: String(parsed.userName),
    };
  } catch {
    return null;
  }
}

export function persistAuth(user: AuthUser): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

/** Login via tabel `public.users` — kolom `username` + `password`. */
export async function loginWithCredentials(
  userName: string,
  password: string,
): Promise<AuthUser> {
  if (!isSupabaseConfigured()) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  const trimmedUser = userName.trim();
  const trimmedPass = password;

  if (!trimmedUser || !trimmedPass) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const { data, error } = await supabase
    .from(TABLES.users)
    .select(`id, ${USER_LOGIN_COLUMNS.username}`)
    .eq(USER_LOGIN_COLUMNS.username, trimmedUser)
    .eq(USER_LOGIN_COLUMNS.password, trimmedPass)
    .maybeSingle();

  if (error) {
    console.error('[auth] users query error:', error.message, error.code);
    throw new Error('LOGIN_FAILED');
  }

  const username = data?.[USER_LOGIN_COLUMNS.username as keyof typeof data];
  if (!data?.id || !username) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const user: AuthUser = {
    id: String(data.id),
    userName: String(username),
  };

  persistAuth(user);
  return user;
}
