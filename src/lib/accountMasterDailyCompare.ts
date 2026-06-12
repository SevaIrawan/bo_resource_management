import { dedupeDailyRowsByGroupId } from '@/lib/dedupeScrapeDaily';
import {
  getCachedDailyRows,
  getCachedMasterRows,
} from '@/lib/masterDailyLoadCache';
import {
  buildDailyGroupIdSet,
  buildMasterGroupIdSet,
  isDailyGroupIdInMaster,
  isMasterGroupIdInDaily,
  normalizeGroupNameForMatch,
} from '@/lib/masterDailyMatch';
import { TABLES } from '@/config/tables';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import type { Platform } from '@/types/database';

/** Satu sumber logika: grid Y/X, ticket 5 tipe, group link — semua akun, join group_id raw. */

export type CompareDailyRow = {
  group_id: string;
  group_name: string | null;
  invite_link: string | null;
  is_admin?: string;
};

export type CompareMasterRow = {
  group_id: string;
  group_name: string | null;
  invite_link: string | null;
};

export interface TicketCompareRow {
  groupId: string;
  groupName: string | null;
  groupLink: string | null;
}

export interface DuplicateGroupIdRow extends TicketCompareRow {
  deviceName: string;
  masterName: string;
}

export interface DuplicateGroupNameRow extends TicketCompareRow {
  clashMasterGroupId: string;
}

export interface AccountTicketBreakdown {
  /** Y — distinct group_id daily (sama grid groupsCurrent). */
  dailyY: number;
  /** X — distinct group_id master brand (sama grid groupsTotal). */
  masterX: number;
  /** Master ∩ daily by raw group_id. */
  joinedInMaster: number;
  adminInMaster: number;
  junk: TicketCompareRow[];
  missing: TicketCompareRow[];
  notAdmin: TicketCompareRow[];
  duplicateGroupId: DuplicateGroupIdRow[];
  duplicateGroupName: DuplicateGroupNameRow[];
}

export function dedupeMasterRowsByGroupId<T extends { group_id: string | null | undefined }>(
  rows: T[],
): T[] {
  return dedupeDailyRowsByGroupId(rows);
}

/** Hitung semua issue + metrik join — logic identik reconcileTicketsForAccount. */
export function computeAccountTicketBreakdown(
  masterRows: CompareMasterRow[],
  dailyRows: CompareDailyRow[],
): AccountTicketBreakdown {
  const dailyDeduped = dedupeDailyRowsByGroupId(dailyRows);
  const masterDeduped = dedupeMasterRowsByGroupId(masterRows);

  const masterIdSet = buildMasterGroupIdSet(masterDeduped);
  const dailyIdSet = buildDailyGroupIdSet(dailyDeduped);

  const dailyByGid = new Map<string, CompareDailyRow>();
  for (const d of dailyDeduped) {
    const gid = String(d.group_id ?? '').trim();
    if (gid) dailyByGid.set(gid, d);
  }

  const masterByRawGid = new Map<string, CompareMasterRow>();
  for (const m of masterDeduped) {
    const gid = String(m.group_id ?? '').trim();
    if (gid && !masterByRawGid.has(gid)) masterByRawGid.set(gid, m);
  }

  const junk: TicketCompareRow[] = [];
  for (const d of dailyDeduped) {
    const gid = String(d.group_id ?? '').trim();
    if (!gid || isDailyGroupIdInMaster(gid, masterIdSet)) continue;
    junk.push({
      groupId: gid,
      groupName: d.group_name,
      groupLink: d.invite_link,
    });
  }

  const missing: TicketCompareRow[] = [];
  const notAdmin: TicketCompareRow[] = [];
  let joinedInMaster = 0;
  let adminInMaster = 0;

  for (const m of masterDeduped) {
    const gid = String(m.group_id ?? '').trim();
    if (!gid) continue;

    if (!isMasterGroupIdInDaily(gid, dailyIdSet)) {
      missing.push({
        groupId: gid,
        groupName: m.group_name,
        groupLink: m.invite_link,
      });
      continue;
    }

    joinedInMaster += 1;
    const d = dailyByGid.get(gid);
    if (d?.is_admin === 'yes') adminInMaster += 1;
    else if (d) {
      notAdmin.push({
        groupId: gid,
        groupName: m.group_name ?? d.group_name,
        groupLink: m.invite_link ?? d.invite_link,
      });
    }
  }

  const duplicateGroupId: DuplicateGroupIdRow[] = [];
  for (const d of dailyDeduped) {
    const gid = String(d.group_id ?? '').trim();
    const gname = String(d.group_name ?? '').trim();
    if (!gid || !isDailyGroupIdInMaster(gid, masterIdSet)) continue;

    const canon = masterByRawGid.get(gid);
    if (!canon) continue;

    const canonName = String(canon.group_name ?? '').trim();
    if (gname && canonName && gname.toLowerCase() !== canonName.toLowerCase()) {
      duplicateGroupId.push({
        groupId: gid,
        groupName: d.group_name,
        groupLink: d.invite_link,
        deviceName: gname,
        masterName: canonName,
      });
    }
  }

  const duplicateGroupName: DuplicateGroupNameRow[] = [];
  for (const d of dailyDeduped) {
    const gid = String(d.group_id ?? '').trim();
    const gnameNorm = normalizeGroupNameForMatch(d.group_name);
    if (!gid || !gnameNorm) continue;

    if (isDailyGroupIdInMaster(gid, masterIdSet)) {
      const canon = masterByRawGid.get(gid);
      const canonNameNorm = normalizeGroupNameForMatch(canon?.group_name);
      if (canonNameNorm && canonNameNorm !== gnameNorm) continue;
    }

    const masterClash = masterDeduped.find((m) => {
      const mGid = String(m.group_id ?? '').trim();
      const mNameNorm = normalizeGroupNameForMatch(m.group_name);
      return mNameNorm === gnameNorm && mGid !== gid;
    });
    if (!masterClash) continue;

    duplicateGroupName.push({
      groupId: gid,
      groupName: d.group_name,
      groupLink: d.invite_link,
      clashMasterGroupId: String(masterClash.group_id ?? '').trim(),
    });
  }

  return {
    dailyY: dailyIdSet.size,
    masterX: masterIdSet.size,
    joinedInMaster,
    adminInMaster,
    junk,
    missing,
    notAdmin,
    duplicateGroupId,
    duplicateGroupName,
  };
}

export async function loadMasterDailyForAccount(input: {
  accountId: string;
  brandName: string;
  platform: Platform;
}): Promise<{ masterRows: CompareMasterRow[]; dailyRows: CompareDailyRow[] }> {
  const brand = input.brandName.trim();
  if (!brand) return { masterRows: [], dailyRows: [] };

  const cachedMaster = getCachedMasterRows(brand, input.platform);
  const cachedDaily = getCachedDailyRows(input.accountId);
  if (cachedMaster !== undefined && cachedDaily !== undefined) {
    return { masterRows: cachedMaster, dailyRows: cachedDaily };
  }

  const [master, daily] = await Promise.all([
    fetchAllSupabaseRows<CompareMasterRow>(TABLES.groupsMaster, 'group_id, group_name, invite_link', [
      { column: 'brand', value: brand },
      { column: 'platform', value: input.platform },
    ]),
    fetchAllSupabaseRows<CompareDailyRow>(
      TABLES.groupScrapeDaily,
      'group_id, group_name, invite_link, is_admin',
      [{ column: 'account_id', value: input.accountId }],
    ),
  ]);

  return {
    masterRows: master,
    dailyRows: dedupeDailyRowsByGroupId(daily),
  };
}

/** Invariant grid ↔ ticket: junk − missing = Y − X */
export function assertTicketGridInvariant(b: AccountTicketBreakdown): boolean {
  return b.junk.length - b.missing.length === b.dailyY - b.masterX;
}

/** Metrik kolom Groups/Admin di card bookmark — wajib = sumber ticket reconcile. */
export interface AccountBookmarkMetrics {
  groupsCurrent: number;
  groupsTotal: number;
  adminCurrent: number;
  adminTotal: number;
  joinedInMaster: number;
}

export function bookmarkMetricsFromBreakdown(b: AccountTicketBreakdown): AccountBookmarkMetrics {
  return {
    groupsCurrent: b.dailyY,
    groupsTotal: b.masterX,
    adminCurrent: b.adminInMaster,
    adminTotal: b.masterX,
    joinedInMaster: b.joinedInMaster,
  };
}

export async function fetchAccountBookmarkMetrics(input: {
  accountId: string;
  brandName: string;
  platform: Platform;
}): Promise<AccountBookmarkMetrics> {
  const { masterRows, dailyRows } = await loadMasterDailyForAccount(input);
  return bookmarkMetricsFromBreakdown(computeAccountTicketBreakdown(masterRows, dailyRows));
}
