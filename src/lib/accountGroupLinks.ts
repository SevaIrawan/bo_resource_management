import { dedupeMasterRowsByGroupId } from '@/lib/accountMasterDailyCompare';
import { normalizeDbAccountId } from '@/lib/accountDbId';
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
  /** Creator/owner akun ini di grup (dari daily.is_owner). */
  isOwner: AdminYesNo;
  /** true bila group_id ada di daily akun (join). */
  isJoined?: boolean;
  inMaster: boolean;
  memberCount: number;
  adminCount: number;
  memberNonAdmin?: number;
  stockStatus?: GroupStockBucket;
}

type DailyGroupRow = {
  group_id: string;
  group_name: string | null;
  invite_link: string | null;
  is_admin: AdminYesNo;
  is_owner?: AdminYesNo | null;
  member_count: number;
  admin_count: number;
  scraped_at: string;
};

async function fetchDailyForAccount(accountId: string, keepLatest = false): Promise<DailyGroupRow[]> {
  const rows = await fetchAllSupabaseRows<DailyGroupRow>(
    TABLES.groupScrapeDaily,
    'group_id, group_name, invite_link, is_admin, is_owner, member_count, admin_count, scraped_at',
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

function mapDailyToLinkRow(
  d: DailyGroupRow,
  inMaster: boolean,
): AccountGroupLinkRow {
  const gid = String(d.group_id).trim();
  return {
    groupId: gid,
    groupName: (d.group_name as string)?.trim() || 'Group',
    inviteLink: d.invite_link?.trim() || null,
    isAdmin: d.is_admin === 'yes' ? 'yes' : 'no',
    isOwner: d.is_owner === 'yes' ? 'yes' : 'no',
    isJoined: true,
    inMaster,
    memberCount: Math.max(0, Number(d.member_count) || 0),
    adminCount: Math.max(0, Number(d.admin_count) || 0),
  };
}

/**
 * Details Group — satu load daily + master, lalu turunkan On Device & Junk.
 * On Device = semua daily (inMaster dari compare master).
 * Junk = daily yang group_id tidak ada di master (selaras daily_junk_group).
 */
export async function fetchAccountDetailsGroupLinks(
  brand: string,
  platform: Platform,
  accountId?: string,
): Promise<{ account: AccountGroupLinkRow[]; junk: AccountGroupLinkRow[] }> {
  const dbId = accountId ? normalizeDbAccountId(accountId) : null;
  if (!dbId) return { account: [], junk: [] };

  const [daily, master] = await Promise.all([
    fetchDailyForAccount(dbId, true),
    fetchMasterForBrand(brand, platform),
  ]);
  const masterIdSet = buildMasterGroupIdSet(master);

  const account: AccountGroupLinkRow[] = [];
  const junk: AccountGroupLinkRow[] = [];
  for (const d of daily) {
    const gid = String(d.group_id).trim();
    if (!gid) continue;
    const inMaster = isDailyGroupIdInMaster(gid, masterIdSet);
    const row = mapDailyToLinkRow(d, inMaster);
    account.push(row);
    if (!inMaster) junk.push(row);
  }

  account.sort((a, b) => a.groupName.localeCompare(b.groupName));
  junk.sort((a, b) => a.groupName.localeCompare(b.groupName));
  return { account, junk };
}

/** Semua grup di daily akun (hasil scrape device). Optional brand+platform → set inMaster. */
export async function fetchAccountDailyGroupLinks(
  accountId?: string,
  options?: { brand?: string; platform?: Platform },
): Promise<AccountGroupLinkRow[]> {
  const dbId = accountId ? normalizeDbAccountId(accountId) : null;
  if (!dbId) return [];

  const brand = options?.brand?.trim();
  const platform = options?.platform;
  if (brand && platform) {
    const { account } = await fetchAccountDetailsGroupLinks(brand, platform, accountId);
    return account;
  }

  const daily = await fetchDailyForAccount(dbId, true);
  const rows: AccountGroupLinkRow[] = [];
  for (const d of daily) {
    const gid = String(d.group_id).trim();
    if (!gid) continue;
    rows.push(mapDailyToLinkRow(d, false));
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
  const dbId = accountId ? normalizeDbAccountId(accountId) : null;
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
      isOwner: d?.is_owner === 'yes' ? 'yes' : 'no',
      isJoined: Boolean(d),
      inMaster: true,
      memberCount: Math.max(0, Number(d?.member_count) || 0),
      adminCount: Math.max(0, Number(d?.admin_count) || 0),
      memberNonAdmin,
      stockStatus: computeReportingStockStatus(groupName, memberNonAdmin, brandTrimmed),
    });
  }

  return rows.sort((a, b) => a.groupName.localeCompare(b.groupName));
}

/** Missing = master belum join; Not admin = join tapi is_admin bukan yes. */
export async function fetchAccountMasterGapGroupLinks(
  brand: string,
  platform: Platform,
  accountId?: string,
): Promise<{ missing: AccountGroupLinkRow[]; notAdmin: AccountGroupLinkRow[] }> {
  const all = await fetchAccountGroupLinks(brand, platform, accountId);
  const missing: AccountGroupLinkRow[] = [];
  const notAdmin: AccountGroupLinkRow[] = [];
  for (const row of all) {
    if (!row.isJoined) {
      missing.push(row);
      continue;
    }
    if (row.isAdmin !== 'yes') notAdmin.push(row);
  }
  return { missing, notAdmin };
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
  const { junk } = await fetchAccountDetailsGroupLinks(brand, platform, accountId);
  return junk;
}
