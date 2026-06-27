import { dedupeMasterRowsByGroupId } from '@/lib/accountMasterDailyCompare';
import {
  dedupeDailyRowsByGroupId,
  dedupeDailyRowsByGroupIdKeepLatest,
} from '@/lib/dedupeScrapeDaily';
import { buildMasterGroupIdSet, isDailyGroupIdInMaster } from '@/lib/masterDailyMatch';
import { computeReportingStockStatus } from '@/lib/reportingStockStatus';
import { TABLES } from '@/config/tables';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import type { GroupStockBucket } from '@/types/groupStock';
import type { AdminYesNo, Platform } from '@/types/database';

export interface AccountGroupLinkRow {
  groupId: string;
  groupName: string;
  inviteLink: string | null;
  isAdmin: AdminYesNo;
  inMaster: boolean;
  memberCount: number;
  adminCount: number;
  memberNonAdmin?: number;
  stockStatus?: GroupStockBucket;
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

type DailyGroupRow = {
  group_id: string;
  group_name: string | null;
  invite_link: string | null;
  is_admin: AdminYesNo;
  member_count: number;
  admin_count: number;
  scraped_at: string;
};

async function fetchDailyForAccount(accountId: string, keepLatest = false): Promise<DailyGroupRow[]> {
  const rows = await fetchAllSupabaseRows<DailyGroupRow>(
    TABLES.groupScrapeDaily,
    'group_id, group_name, invite_link, is_admin, member_count, admin_count, scraped_at',
    [{ column: 'account_id', value: accountId }],
  );
  return keepLatest ? dedupeDailyRowsByGroupIdKeepLatest(rows) : dedupeDailyRowsByGroupId(rows);
}

async function fetchMasterForBrand(
  brand: string,
  platform: Platform,
): Promise<
  {
    group_id: string;
    group_name: string;
    invite_link: string;
    member_non_admin: number;
  }[]
> {
  const rows = await fetchAllSupabaseRows<{
    group_id: string;
    group_name: string;
    invite_link: string;
    member_non_admin: number;
  }>(TABLES.groupsMaster, 'group_id, group_name, invite_link, member_non_admin', [
    { column: 'brand', value: brand.trim() },
    { column: 'platform', value: platform },
  ]);
  return dedupeMasterRowsByGroupId(rows) as {
    group_id: string;
    group_name: string;
    invite_link: string;
    member_non_admin: number;
  }[];
}

/** Semua grup di daily akun (hasil scrape device) — tanpa filter master/admin. */
export async function fetchAccountDailyGroupLinks(
  accountId?: string,
): Promise<AccountGroupLinkRow[]> {
  const dbId = normalizeDbAccountId(accountId);
  if (!dbId) return [];

  const daily = await fetchDailyForAccount(dbId, true);
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
      memberCount: Math.max(0, Number(d.member_count) || 0),
      adminCount: Math.max(0, Number(d.admin_count) || 0),
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
  const daily = dbId ? await fetchDailyForAccount(dbId, true) : [];
  const dailyByGid = new Map(daily.map((d) => [String(d.group_id).trim(), d]));

  const master = await fetchMasterForBrand(brand, platform);
  const rows: AccountGroupLinkRow[] = [];
  const brandTrimmed = brand.trim();

  for (const m of master) {
    const gid = String(m.group_id).trim();
    if (!gid) continue;
    const d = dailyByGid.get(gid);
    const groupName = (m.group_name ?? '').trim() || 'Group';
    const memberNonAdmin = Math.max(0, Number(m.member_non_admin) || 0);
    rows.push({
      groupId: gid,
      groupName,
      inviteLink: m.invite_link?.trim() || null,
      isAdmin: d?.is_admin === 'yes' ? 'yes' : 'no',
      inMaster: true,
      memberCount: Math.max(0, Number(d?.member_count) || 0),
      adminCount: Math.max(0, Number(d?.admin_count) || 0),
      memberNonAdmin,
      stockStatus: computeReportingStockStatus(groupName, memberNonAdmin, brandTrimmed),
    });
  }

  return rows.sort((a, b) => a.groupName.localeCompare(b.groupName));
}

/**
 * Junk (Group mismatch): grup di daily akun yang group_id-nya tidak ada di master brand.
 * Selaras ticket daily_junk_group / computeAccountTicketBreakdown.junk.
 */
export async function fetchAccountJunkGroupLinks(
  brand: string,
  platform: Platform,
  accountId?: string,
): Promise<AccountGroupLinkRow[]> {
  const dbId = normalizeDbAccountId(accountId);
  if (!dbId) return [];

  const daily = await fetchDailyForAccount(dbId, true);
  const master = await fetchMasterForBrand(brand, platform);
  const masterIdSet = buildMasterGroupIdSet(master);

  const rows: AccountGroupLinkRow[] = [];
  for (const d of daily) {
    const gid = String(d.group_id).trim();
    if (!gid || isDailyGroupIdInMaster(gid, masterIdSet)) continue;
    rows.push({
      groupId: gid,
      groupName: (d.group_name as string)?.trim() || 'Group',
      inviteLink: d.invite_link?.trim() || null,
      isAdmin: d.is_admin === 'yes' ? 'yes' : 'no',
      inMaster: false,
      memberCount: Math.max(0, Number(d.member_count) || 0),
      adminCount: Math.max(0, Number(d.admin_count) || 0),
    });
  }

  return rows.sort((a, b) => a.groupName.localeCompare(b.groupName));
}
