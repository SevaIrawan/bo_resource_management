import { TABLES } from '@/config/tables';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import { dedupeDailyRowsByGroupIdKeepLatest } from '@/lib/dedupeScrapeDaily';
import type { Platform } from '@/types/database';
import type { CsvJoinRow } from './parseCsvJoinImport';

export type CsvJoinValidationStatus = 'matched' | 'already_joined' | 'not_in_master';

export interface ValidatedCsvJoinRow {
  groupId: string;
  groupName: string;
  inviteLink: string;
  status: CsvJoinValidationStatus;
  /** Original CSV row reference */
  csvRow: CsvJoinRow;
}

interface MasterRow {
  group_id: string;
  group_name: string | null;
  invite_link: string | null;
  [key: string]: unknown;
}

interface DailyRow {
  group_id: string;
  group_name: string | null;
  scraped_at?: string | null;
  [key: string]: unknown;
}

export interface ValidateCsvJoinResult {
  rows: ValidatedCsvJoinRow[];
  matchedCount: number;
  alreadyJoinedCount: number;
  notInMasterCount: number;
}

/**
 * Validate parsed CSV rows against groups_master and group_scrape_daily.
 * Returns status per row: matched (can queue), already_joined, or not_in_master.
 */
export async function validateCsvJoinAgainstMaster(input: {
  csvRows: CsvJoinRow[];
  brandName: string;
  platform: Platform;
  accountIds: string[];
  busyGroupIds?: ReadonlySet<string>;
}): Promise<ValidateCsvJoinResult> {
  const { csvRows, brandName, platform, accountIds, busyGroupIds } = input;

  if (csvRows.length === 0 || !brandName || accountIds.length === 0) {
    return { rows: [], matchedCount: 0, alreadyJoinedCount: 0, notInMasterCount: 0 };
  }

  const [masterRows, ...dailyArrays] = await Promise.all([
    fetchAllSupabaseRows<MasterRow>(
      TABLES.groupsMaster,
      'group_id, group_name, invite_link',
      [
        { column: 'brand', value: brandName },
        { column: 'platform', value: platform },
      ],
    ),
    ...accountIds.map((accountId) =>
      fetchAllSupabaseRows<DailyRow & { scraped_at?: string | null }>(
        TABLES.groupScrapeDaily,
        'group_id, group_name, scraped_at',
        [{ column: 'account_id', value: accountId }],
      ),
    ),
  ]);

  const masterByGroupId = new Map<string, MasterRow>();
  const masterByNameLower = new Map<string, MasterRow>();
  const masterByInviteLink = new Map<string, MasterRow>();

  for (const m of masterRows) {
    const gid = (m.group_id ?? '').trim();
    if (!gid) continue;
    if (!masterByGroupId.has(gid)) masterByGroupId.set(gid, m);
    const name = (m.group_name ?? '').trim().toLowerCase();
    if (name && !masterByNameLower.has(name)) masterByNameLower.set(name, m);
    const link = (m.invite_link ?? '').trim();
    if (link && !masterByInviteLink.has(link)) masterByInviteLink.set(link, m);
  }

  const dailyGroupIds = new Set<string>();
  for (const dailyRows of dailyArrays) {
    const deduped = dedupeDailyRowsByGroupIdKeepLatest(dailyRows);
    for (const d of deduped) {
      const gid = (d.group_id ?? '').trim();
      if (gid) dailyGroupIds.add(gid);
    }
  }

  const results: ValidatedCsvJoinRow[] = [];
  let matchedCount = 0;
  let alreadyJoinedCount = 0;
  let notInMasterCount = 0;

  for (const csvRow of csvRows) {
    let master: MasterRow | undefined;

    if (csvRow.groupId) {
      master = masterByGroupId.get(csvRow.groupId);
    }
    if (!master && csvRow.inviteLink) {
      master = masterByInviteLink.get(csvRow.inviteLink);
    }
    if (!master && csvRow.groupName) {
      master = masterByNameLower.get(csvRow.groupName.toLowerCase());
    }

    if (!master) {
      notInMasterCount++;
      results.push({
        groupId: csvRow.groupId ?? '',
        groupName: csvRow.groupName ?? csvRow.groupId ?? '—',
        inviteLink: '',
        status: 'not_in_master',
        csvRow,
      });
      continue;
    }

    const gid = master.group_id.trim();
    const inviteLink = (master.invite_link ?? '').trim();

    if (dailyGroupIds.has(gid) || busyGroupIds?.has(gid)) {
      alreadyJoinedCount++;
      results.push({
        groupId: gid,
        groupName: (master.group_name ?? '').trim() || csvRow.groupName || 'Group',
        inviteLink,
        status: 'already_joined',
        csvRow,
      });
      continue;
    }

    if (!inviteLink) {
      notInMasterCount++;
      results.push({
        groupId: gid,
        groupName: (master.group_name ?? '').trim() || csvRow.groupName || 'Group',
        inviteLink: '',
        status: 'not_in_master',
        csvRow,
      });
      continue;
    }

    matchedCount++;
    results.push({
      groupId: gid,
      groupName: (master.group_name ?? '').trim() || csvRow.groupName || 'Group',
      inviteLink,
      status: 'matched',
      csvRow,
    });
  }

  return { rows: results, matchedCount, alreadyJoinedCount, notInMasterCount };
}
