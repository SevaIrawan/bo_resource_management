/**
 * Reporting read-only — master + daily saja. Tidak sentuh ticket/scraper/session.
 */
import { dedupeMasterRowsByGroupId } from '@/lib/accountMasterDailyCompare';
import { fetchAccountDailyGroupLinks, type AccountGroupLinkRow } from '@/lib/accountGroupLinks';
import { dedupeDailyRowsByGroupIdKeepLatest } from '@/lib/dedupeScrapeDaily';
import { buildDailyGroupIdSet, isMasterGroupIdInDaily } from '@/lib/masterDailyMatch';
import { TABLES } from '@/config/tables';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import type { Platform } from '@/types/database';

export type ReportingAccountRef = {
  id: string;
  accountName: string;
};

export type JoinGroupMatrixRow = {
  groupName: string;
  groupId: string;
  inviteLink: string | null;
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
    }>(TABLES.groupsMaster, 'group_id, group_name, invite_link', [
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
    rows.push({
      groupName: String(m.group_name ?? '').trim() || 'Group',
      groupId: gid,
      inviteLink: m.invite_link?.trim() || null,
      joinByAccountId,
      adminByAccountId,
    });
  }

  rows.sort((a, b) => a.groupName.localeCompare(b.groupName));
  return rows;
}

export async function loadAccountDailyReport(accountId: string): Promise<AccountGroupLinkRow[]> {
  return fetchAccountDailyGroupLinks(accountId);
}
