import {
  computeAccountTicketBreakdown,
  loadMasterDailyForAccount,
} from '@/lib/accountMasterDailyCompare';
import { MESSAGING_ACCOUNT_SELECT } from '@/config/dbColumns';
import { pickBrandNameForReconcile } from '@/lib/reconcileBrandName';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import { ticketDescriptionEn } from '@/lib/ticketNote';
import { buildTicketIssueId } from '@/lib/ticketIssueId';
import {
  ticketGroupKey,
  type TicketDetailLine,
  type TicketSummaryGroup,
} from '@/lib/ticketGroups';
import type { Platform } from '@/types/database';
import type { TicketAccent, TicketType } from '@/types/ticketMonitoringUi';

const ENGINE_CONCURRENCY = 2;

function ticketAccent(type: TicketType): TicketAccent {
  return type === 'not_admin' ? 'warning' : 'danger';
}

function lineId(prefix: string, groupId: string, index: number): string {
  return `${prefix}-${groupId}-${index}`;
}

function buildLinesForType(
  ticketType: TicketType,
  breakdown: ReturnType<typeof computeAccountTicketBreakdown>,
): TicketDetailLine[] {
  switch (ticketType) {
    case 'daily_junk_group':
      return breakdown.junk.map((r, i) => ({
        id: lineId('jk', r.groupId, i),
        groupId: r.groupId,
        groupName: r.groupName,
        groupLink: r.groupLink,
        description: ticketDescriptionEn.dailyJunk(r.groupName?.trim() || r.groupId),
      }));
    case 'missing_group':
      return breakdown.missing.map((r, i) => ({
        id: lineId('ms', r.groupId, i),
        groupId: r.groupId,
        groupName: r.groupName,
        groupLink: r.groupLink,
        description: ticketDescriptionEn.missingGroup(r.groupName?.trim() || r.groupId),
      }));
    case 'not_admin':
      return breakdown.notAdmin.map((r, i) => ({
        id: lineId('na', r.groupId, i),
        groupId: r.groupId,
        groupName: r.groupName,
        groupLink: r.groupLink,
        description: ticketDescriptionEn.notAdmin(r.groupName?.trim() || r.groupId),
      }));
    case 'duplicate_group_id':
      return breakdown.duplicateGroupId.map((r, i) => ({
        id: lineId('di', r.groupId, i),
        groupId: r.groupId,
        groupName: r.groupName,
        groupLink: r.groupLink,
        description: ticketDescriptionEn.duplicateGroupId(r.deviceName, r.masterName),
      }));
    case 'duplicate_group_name':
      return breakdown.duplicateGroupName.map((r, i) => ({
        id: lineId('dn', r.groupId, i),
        groupId: r.groupId,
        groupName: r.groupName,
        groupLink: r.groupLink,
        description: ticketDescriptionEn.duplicateGroupName(
          r.groupName?.trim() || r.groupId,
          r.groupId,
          r.clashMasterGroupId,
        ),
      }));
    default:
      return [];
  }
}

const TICKET_TYPES: TicketType[] = [
  'daily_junk_group',
  'missing_group',
  'not_admin',
  'duplicate_group_id',
  'duplicate_group_name',
];

function buildSummaryForType(input: {
  accountId: string;
  accountName: string;
  phoneNumber: string;
  brandName: string;
  platform: Platform;
  ticketType: TicketType;
  lines: TicketDetailLine[];
}): TicketSummaryGroup | null {
  if (!input.lines.length) return null;

  return {
    key: ticketGroupKey({
      accountId: input.accountId,
      brandName: input.brandName,
      platform: input.platform,
      ticketType: input.ticketType,
    }),
    accountId: input.accountId,
    issueId: buildTicketIssueId({
      accountId: input.accountId,
      brandName: input.brandName,
      platform: input.platform,
      ticketType: input.ticketType,
    }),
    ticketType: input.ticketType,
    accent: ticketAccent(input.ticketType),
    accountName: input.accountName,
    brandName: input.brandName,
    platform: input.platform,
    phoneNumber: input.phoneNumber,
    itemCount: input.lines.length,
    lines: input.lines,
  };
}

/**
 * Kartu ticket UI — sumber angka SAMA dengan kolom Groups/Admin bookmark.
 * (computeAccountTicketBreakdown + master/daily, bukan hitung baris load DB.)
 */
export async function buildTicketSummariesForUser(userId: string): Promise<TicketSummaryGroup[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: accounts, error } = await supabase
    .from(TABLES.messagingAccounts)
    .select(MESSAGING_ACCOUNT_SELECT)
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw error;
  if (!accounts?.length) return [];

  const brandIds = [
    ...new Set(
      accounts
        .map((row) => row.brand_id as string | undefined)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const brandNameById = new Map<string, string>();
  if (brandIds.length) {
    const { data: brandRows, error: brandError } = await supabase
      .from(TABLES.brands)
      .select('id, name')
      .in('id', brandIds);
    if (brandError) throw brandError;
    for (const row of brandRows ?? []) {
      const name = String(row.name ?? '').trim();
      if (name) brandNameById.set(row.id as string, name);
    }
  }

  const summaries: TicketSummaryGroup[] = [];

  for (let i = 0; i < accounts.length; i += ENGINE_CONCURRENCY) {
    const chunk = accounts.slice(i, i + ENGINE_CONCURRENCY);
    await Promise.all(
      chunk.map(async (row) => {
        const accountId = row.id as string;
        const brandId = row.brand_id as string | undefined;
        if (!brandId) return;

        const meta = row.metadata as { brand?: string } | null;
        const brandName = pickBrandNameForReconcile(brandId, meta, brandNameById);
        if (!brandName) return;

        const platform = row.platform as Platform;
        const { masterRows, dailyRows } = await loadMasterDailyForAccount({
          accountId,
          brandName,
          platform,
        });
        const breakdown = computeAccountTicketBreakdown(masterRows, dailyRows);

        const accountName = String(row.label ?? '').trim() || accountId;
        const phoneNumber = String(row.phone_number ?? '').trim();

        for (const ticketType of TICKET_TYPES) {
          const lines = buildLinesForType(ticketType, breakdown);
          const group = buildSummaryForType({
            accountId,
            accountName,
            phoneNumber,
            brandName,
            platform,
            ticketType,
            lines,
          });
          if (group) summaries.push(group);
        }
      }),
    );
  }

  return summaries.sort((a, b) => {
    const brand = a.brandName.localeCompare(b.brandName);
    if (brand !== 0) return brand;
    const acc = a.accountName.localeCompare(b.accountName);
    if (acc !== 0) return acc;
    return a.ticketType.localeCompare(b.ticketType);
  });
}
