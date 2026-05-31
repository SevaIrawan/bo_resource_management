import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { AdminYesNo, Platform } from '@/types/database';

export interface AccountGroupLinkRow {
  groupId: string;
  groupName: string;
  inviteLink: string | null;
  isAdmin: AdminYesNo;
  inMaster: boolean;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function normalizeDbAccountId(accountId: string | undefined): string | null {
  if (!accountId) return null;
  const trimmed = accountId.trim();
  if (UUID_RE.test(trimmed)) return trimmed;
  if (trimmed.startsWith('acc-')) {
    const id = trimmed.slice(4);
    return UUID_RE.test(id) ? id : null;
  }
  return null;
}

async function fetchDailyForAccount(accountId: string): Promise<
  {
    group_id: string;
    group_name: string | null;
    invite_link: string | null;
    is_admin: AdminYesNo;
  }[]
> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLES.groupScrapeDaily)
    .select('group_id, group_name, invite_link, is_admin')
    .eq('account_id', accountId)
    .order('group_name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function fetchMasterForBrand(
  brand: string,
  platform: Platform,
): Promise<
  {
    group_id: string;
    group_name: string;
    invite_link: string;
  }[]
> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLES.groupsMaster)
    .select('group_id, group_name, invite_link')
    .eq('brand', brand.trim())
    .eq('platform', platform)
    .order('group_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as {
    group_id: string;
    group_name: string;
    invite_link: string;
  }[];
}

/**
 * Modal Group Links: master brand (link valid) + status admin/join dari daily akun.
 * Grup hanya di daily (belum di master) ikut untuk comparison.
 */
export async function fetchAccountGroupLinks(
  brand: string,
  platform: Platform,
  accountId?: string,
): Promise<AccountGroupLinkRow[]> {
  const dbId = normalizeDbAccountId(accountId);
  const daily = dbId ? await fetchDailyForAccount(dbId) : [];
  const dailyByGid = new Map(daily.map((d) => [String(d.group_id).trim(), d]));

  const master = await fetchMasterForBrand(brand, platform);
  const seen = new Set<string>();
  const rows: AccountGroupLinkRow[] = [];

  for (const m of master) {
    const gid = String(m.group_id).trim();
    seen.add(gid);
    const d = dailyByGid.get(gid);
    rows.push({
      groupId: gid,
      groupName: (m.group_name ?? '').trim() || 'Group',
      inviteLink: m.invite_link?.trim() || null,
      isAdmin: d?.is_admin === 'yes' ? 'yes' : 'no',
      inMaster: true,
    });
  }

  for (const d of daily) {
    const gid = String(d.group_id).trim();
    if (!gid || seen.has(gid)) continue;
    rows.push({
      groupId: gid,
      groupName: (d.group_name as string)?.trim() || 'Group',
      inviteLink: d.invite_link?.trim() || null,
      isAdmin: d.is_admin === 'yes' ? 'yes' : 'no',
      inMaster: false,
    });
  }

  return rows.sort((a, b) => a.groupName.localeCompare(b.groupName));
}
