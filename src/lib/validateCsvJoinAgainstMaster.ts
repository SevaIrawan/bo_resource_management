import { TABLES } from '@/config/tables';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';
import { dedupeDailyRowsByGroupIdKeepLatest } from '@/lib/dedupeScrapeDaily';
import {
  looksLikeInviteLink,
  normalizeGroupIdForMatch,
  normalizeGroupNameForMatch,
  normalizeInviteLinkForMatch,
} from '@/lib/masterDailyMatch';
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

function resolveCsvInviteCandidate(csvRow: CsvJoinRow): string | undefined {
  if (csvRow.inviteLink?.trim()) return csvRow.inviteLink.trim();
  if (csvRow.groupId && looksLikeInviteLink(csvRow.groupId)) return csvRow.groupId.trim();
  if (csvRow.groupName && looksLikeInviteLink(csvRow.groupName)) return csvRow.groupName.trim();
  return undefined;
}

function displayLabelForUnmatched(csvRow: CsvJoinRow): string {
  return (
    csvRow.groupName?.trim() ||
    csvRow.inviteLink?.trim() ||
    csvRow.groupId?.trim() ||
    '—'
  );
}

/**
 * Validate parsed CSV rows against groups_master and group_scrape_daily.
 * Kontrak: group id | group name | invite-only | hybrid — match via id / invite / nama.
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
  const masterByInvite = new Map<string, MasterRow>();

  for (const m of masterRows) {
    const gid = (m.group_id ?? '').trim();
    if (!gid) continue;
    if (!masterByGroupId.has(gid)) masterByGroupId.set(gid, m);
    const gidNorm = normalizeGroupIdForMatch(gid);
    if (gidNorm && !masterByGroupId.has(gidNorm)) masterByGroupId.set(gidNorm, m);

    const name = normalizeGroupNameForMatch(m.group_name);
    if (name && !masterByNameLower.has(name)) masterByNameLower.set(name, m);

    const invNorm = normalizeInviteLinkForMatch(m.invite_link);
    if (invNorm && !masterByInvite.has(invNorm)) masterByInvite.set(invNorm, m);
    const invRaw = (m.invite_link ?? '').trim();
    if (invRaw && !masterByInvite.has(invRaw)) masterByInvite.set(invRaw, m);
  }

  const dailyGroupIds = new Set<string>();
  for (const dailyRows of dailyArrays) {
    const deduped = dedupeDailyRowsByGroupIdKeepLatest(dailyRows);
    for (const d of deduped) {
      const gid = (d.group_id ?? '').trim();
      if (gid) {
        dailyGroupIds.add(gid);
        const norm = normalizeGroupIdForMatch(gid);
        if (norm) dailyGroupIds.add(norm);
      }
    }
  }

  const results: ValidatedCsvJoinRow[] = [];
  let matchedCount = 0;
  let alreadyJoinedCount = 0;
  let notInMasterCount = 0;

  for (const csvRow of csvRows) {
    let master: MasterRow | undefined;
    const inviteCandidate = resolveCsvInviteCandidate(csvRow);

    if (csvRow.groupId && !looksLikeInviteLink(csvRow.groupId)) {
      const rawId = csvRow.groupId.trim();
      master =
        masterByGroupId.get(rawId) ?? masterByGroupId.get(normalizeGroupIdForMatch(rawId));
    }
    if (!master && inviteCandidate) {
      const invNorm = normalizeInviteLinkForMatch(inviteCandidate);
      master =
        (invNorm ? masterByInvite.get(invNorm) : undefined) ??
        masterByInvite.get(inviteCandidate.trim());
    }
    if (!master && csvRow.groupName && !looksLikeInviteLink(csvRow.groupName)) {
      master = masterByNameLower.get(normalizeGroupNameForMatch(csvRow.groupName));
    }

    if (!master) {
      notInMasterCount++;
      results.push({
        groupId: csvRow.groupId && !looksLikeInviteLink(csvRow.groupId) ? csvRow.groupId : '',
        groupName: displayLabelForUnmatched(csvRow),
        inviteLink: inviteCandidate ?? '',
        status: 'not_in_master',
        csvRow,
      });
      continue;
    }

    const gid = master.group_id.trim();
    const inviteLink = (master.invite_link ?? '').trim();

    if (
      dailyGroupIds.has(gid) ||
      dailyGroupIds.has(normalizeGroupIdForMatch(gid)) ||
      busyGroupIds?.has(gid)
    ) {
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
