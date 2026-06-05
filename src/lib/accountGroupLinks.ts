import { dedupeMasterRowsByGroupId } from '@/lib/accountMasterDailyCompare';
import { dedupeDailyRowsByGroupId } from '@/lib/dedupeScrapeDaily';
import { TABLES } from '@/config/tables';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
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
  const rows = await fetchAllSupabaseRows<{
    group_id: string;
    group_name: string | null;
    invite_link: string | null;
    is_admin: AdminYesNo;
  }>(TABLES.groupScrapeDaily, 'group_id, group_name, invite_link, is_admin', [
    { column: 'account_id', value: accountId },
  ]);
  return dedupeDailyRowsByGroupId(rows);
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
  const rows = await fetchAllSupabaseRows<{
    group_id: string;
    group_name: string;
    invite_link: string;
  }>(TABLES.groupsMaster, 'group_id, group_name, invite_link', [
    { column: 'brand', value: brand.trim() },
    { column: 'platform', value: platform },
  ]);
  return dedupeMasterRowsByGroupId(rows) as {
    group_id: string;
    group_name: string;
    invite_link: string;
  }[];
}

/** Semua grup di daily akun (hasil scrape device) — tanpa filter master/admin. */
export async function fetchAccountDailyGroupLinks(
  accountId?: string,
): Promise<AccountGroupLinkRow[]> {
  const dbId = normalizeDbAccountId(accountId);
  if (!dbId) return [];

  const daily = await fetchDailyForAccount(dbId);
  const rows: AccountGroupLinkRow[] = [];
  for (const d of daily) {
    const gid = String(d.group_id).trim();
    if (!gid) continue;
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

/**
 * Admin vs master: daftar master brand (X) + status admin/join dari daily (by group_id).
 * Grup hanya di daily (junk) tidak masuk daftar utama — selaras denominator grid/header.
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
  const rows: AccountGroupLinkRow[] = [];

  for (const m of master) {
    const gid = String(m.group_id).trim();
    if (!gid) continue;
    const d = dailyByGid.get(gid);
    rows.push({
      groupId: gid,
      groupName: (m.group_name ?? '').trim() || 'Group',
      inviteLink: m.invite_link?.trim() || null,
      isAdmin: d?.is_admin === 'yes' ? 'yes' : 'no',
      inMaster: true,
    });
  }

  return rows.sort((a, b) => a.groupName.localeCompare(b.groupName));
}
