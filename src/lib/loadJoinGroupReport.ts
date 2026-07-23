/**
 * Reporting read-only — master + daily saja. Tidak sentuh ticket/scraper/session.
 */
import { dedupeMasterRowsByGroupId } from '@/lib/accountMasterDailyCompare';
import { fetchAccountDailyGroupLinks, type AccountGroupLinkRow } from '@/lib/accountGroupLinks';
import { dedupeDailyRowsByGroupIdKeepLatest } from '@/lib/dedupeScrapeDaily';
import { buildDailyGroupIdSet, isMasterGroupIdInDaily } from '@/lib/masterDailyMatch';
import { computeReportingStockStatus } from '@/lib/reportingStockStatus';
import { TABLES } from '@/config/tables';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import type { GroupStockBucket } from '@/types/groupStock';
import type { Platform } from '@/types/database';

export type ReportingAccountRef = {
  id: string;
  accountName: string;
};

export type JoinGroupMatrixRow = {
  groupName: string;
  groupId: string;
  inviteLink: string | null;
  stockStatus: GroupStockBucket;
  /** accountId → joined (Yes) */
  joinByAccountId: Record<string, boolean>;
  /** accountId → is admin (Yes) — hanya meaningful jika sudah join */
  adminByAccountId: Record<string, boolean>;
};

export async function loadJoinGroupMatrix(input: {
  brandName: string;
  platform: Platform;
  accounts: ReportingAccountRef[];
}): Promise<JoinGroupMatrixRow[]> {
  const brand = input.brandName.trim();
  if (!brand || input.accounts.length === 0) return [];

  const master = dedupeMasterRowsByGroupId(
    await fetchAllSupabaseRows<{
      group_id: string;
      group_name: string | null;
      invite_link: string | null;
      member_non_admin: number;
    }>(TABLES.groupsMaster, 'group_id, group_name, invite_link, member_non_admin', [
      { column: 'brand', value: brand },
      { column: 'platform', value: input.platform },
    ]),
  );

  type DailyRef = { group_id: string; is_admin: string | null; scraped_at: string | null };
  const dailyByAccount = new Map<string, Map<string, DailyRef>>();
  await Promise.all(
    input.accounts.map(async (acc) => {
      const daily = dedupeDailyRowsByGroupIdKeepLatest(
        await fetchAllSupabaseRows<DailyRef>(
          TABLES.groupScrapeDaily,
          'group_id, is_admin, scraped_at',
          [{ column: 'account_id', value: acc.id }],
        ),
      );
      const byGid = new Map<string, DailyRef>();
      for (const row of daily) {
        const gid = String(row.group_id ?? '').trim();
        if (gid) byGid.set(gid, row);
      }
      dailyByAccount.set(acc.id, byGid);
    }),
  );

  const rows: JoinGroupMatrixRow[] = [];
  for (const m of master) {
    const gid = String(m.group_id ?? '').trim();
    if (!gid) continue;
    const joinByAccountId: Record<string, boolean> = {};
    const adminByAccountId: Record<string, boolean> = {};
    for (const acc of input.accounts) {
      const dailyMap = dailyByAccount.get(acc.id) ?? new Map<string, DailyRef>();
      const dailySet = buildDailyGroupIdSet([...dailyMap.values()]);
      const joined = isMasterGroupIdInDaily(gid, dailySet);
      joinByAccountId[acc.id] = joined;
      const dailyRow = dailyMap.get(gid);
      adminByAccountId[acc.id] = joined && dailyRow?.is_admin === 'yes';
    }
    const groupName = String(m.group_name ?? '').trim() || 'Group';
    const memberNonAdmin = Math.max(0, Number(m.member_non_admin) || 0);
    rows.push({
      groupName,
      groupId: gid,
      inviteLink: m.invite_link?.trim() || null,
      stockStatus: computeReportingStockStatus(groupName, memberNonAdmin, brand),
      joinByAccountId,
      adminByAccountId,
    });
  }

  rows.sort((a, b) => a.groupName.localeCompare(b.groupName));
  return rows;
}

export async function loadAccountDailyReport(
  accountId: string,
  brandName: string,
  platform: Platform,
): Promise<AccountGroupLinkRow[]> {
  const brand = brandName.trim();
  const rows = await fetchAccountDailyGroupLinks(accountId, {
    brand,
    platform,
  });
  if (rows.length === 0) return rows;

  const masterRows = dedupeMasterRowsByGroupId(
    await fetchAllSupabaseRows<{
      group_id: string;
      member_non_admin: number;
    }>(TABLES.groupsMaster, 'group_id, member_non_admin', [
      { column: 'brand', value: brand },
      { column: 'platform', value: platform },
    ]),
  );
  const memberNonAdminByGroupId = new Map(
    masterRows.map((row) => [
      String(row.group_id ?? '').trim(),
      Math.max(0, Number(row.member_non_admin) || 0),
    ]),
  );

  return rows.map((row) => {
    const fromMaster = memberNonAdminByGroupId.get(row.groupId);
    const memberNonAdmin =
      fromMaster ?? Math.max(0, row.memberCount - row.adminCount);
    return {
      ...row,
      memberNonAdmin,
      stockStatus: computeReportingStockStatus(row.groupName, memberNonAdmin, brand),
    };
  });
}
