import { USER_LOGIN_COLUMNS } from '@/lib/auth';
import { ADMIN_USERNAME, resolveAppRoleFromUsername } from '@/lib/userRole';
import { getSupabase } from '@/lib/supabase';
import { TABLES } from '@/config/tables';

/**
 * Operator melihat data dashboard milik akun `admin` (satu workspace).
 * Akun admin tetap memakai `user_id` sendiri.
 */
export async function resolveMonitoringUserId(
  loggedInUserId: string,
  userName: string,
): Promise<string> {
  if (resolveAppRoleFromUsername(userName) === 'admin') {
    return loggedInUserId;
  }

  const adminId = await fetchAdminDashboardUserId();
  return adminId ?? loggedInUserId;
}

async function fetchAdminDashboardUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLES.users)
    .select('id')
    .ilike(USER_LOGIN_COLUMNS.username, ADMIN_USERNAME)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}
