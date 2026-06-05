import {
  computeAccountTicketBreakdown,
  loadMasterDailyForAccount,
} from '@/lib/accountMasterDailyCompare';
import { dedupeScrapeDailyRowsForAccount } from '@/lib/dedupeScrapeDaily';
import {
  pickBrandNameForReconcile,
  resolveBrandNameForReconcileAccount,
} from '@/lib/reconcileBrandName';
import { TABLES } from '@/config/tables';
import { ticketDescriptionEn } from '@/lib/ticketNote';
import { openTicketDedupeKey } from '@/lib/ticketDedupe';
import { getSupabase } from '@/lib/supabase';
import type { Platform, TicketType } from '@/types/database';

/**
 * Gap master ↔ daily per akun (dua arah):
 *
 * - daily_junk_group (UI: Group mismatch) — daily LEBIH besar: baris daily yang group_id-nya
 *   TIDAK ada di master. Gap di sisi daily (device/HP). Semua baris daily, tanpa filter admin/invite.
 *
 * - missing_group (UI: Missing groups) — kebalikannya: baris master yang BELUM ada di daily akun.
 *   Gap di sisi master (perlu invite/join).
 *
 * Contoh: master 100, daily 120 → Group mismatch = 20 baris daily; Missing = 0 (jika semua master ada di daily).
 * Setiap daily/master berubah → reconcileTicketsForAccount → resolve/insert ticket → UI reload.
 */
interface ReconcileInput {
  accountId: string;
  brandId: string;
  brandName: string;
  platform: Platform;
}

/** Tutup ticket lama group_count_mismatch (tipe dihapus). */
async function resolveLegacyCountMismatchTickets(accountId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const now = new Date().toISOString();
  await supabase
    .from(TABLES.tickets)
    .update({ status: 'resolved', resolved_at: now })
    .eq('account_id', accountId)
    .eq('ticket_type', 'group_count_mismatch')
    .eq('status', 'open');
}

/** Satu baris open per (account, type, group_id) — bersihkan duplikat historis. */
async function dedupeOpenTicketsForAccount(accountId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: openRows, error } = await supabase
    .from(TABLES.tickets)
    .select('id, ticket_type, group_id, created_at')
    .eq('account_id', accountId)
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!openRows?.length) return;

  const now = new Date().toISOString();
  const seenKeys = new Set<string>();

  for (const row of openRows) {
    const id = row.id as string;
    const key = openTicketDedupeKey(row.ticket_type as TicketType, row.group_id as string | null);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      continue;
    }
    await supabase
      .from(TABLES.tickets)
      .update({ status: 'resolved', resolved_at: now })
      .eq('id', id);
  }
}

const TICKET_INSERT_CHUNK = 150;

interface OpenTicketRowInput {
  description: string;
  groupLink?: string | null;
  groupId?: string | null;
  groupName?: string | null;
}

/** Satu query existing + insert chunk — untuk ribuan missing_group (master >> daily). */
async function batchUpsertOpenTicketsByGroupId(input: {
  accountId: string;
  brandId: string;
  platform: Platform;
  ticketType: TicketType;
  rows: OpenTicketRowInput[];
}): Promise<Set<string>> {
  const supabase = getSupabase();
  /** Hanya group_id yang masih issue — jangan keep semua open ticket lama. */
  const keepIds = new Set<string>();
  if (!supabase) return keepIds;

  for (const row of input.rows) {
    const gid = String(row.groupId ?? '').trim();
    if (gid) keepIds.add(gid);
  }

  if (!input.rows.length) return keepIds;

  const { data: openRows, error: openError } = await supabase
    .from(TABLES.tickets)
    .select('group_id')
    .eq('account_id', input.accountId)
    .eq('ticket_type', input.ticketType)
    .eq('status', 'open');

  if (openError) throw openError;

  const existingGids = new Set<string>();
  for (const row of openRows ?? []) {
    const gid = String(row.group_id ?? '').trim();
    if (gid) existingGids.add(gid);
  }

  const toInsert: Record<string, unknown>[] = [];
  for (const row of input.rows) {
    const gid = String(row.groupId ?? '').trim();
    if (!gid || existingGids.has(gid)) continue;
    existingGids.add(gid);
    toInsert.push({
      account_id: input.accountId,
      brand_id: input.brandId,
      platform: input.platform,
      ticket_type: input.ticketType,
      status: 'open',
      description: row.description,
      group_link: row.groupLink ?? null,
      group_id: gid,
      group_name: row.groupName ?? null,
    });
  }

  for (let i = 0; i < toInsert.length; i += TICKET_INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + TICKET_INSERT_CHUNK);
    const { error } = await supabase.from(TABLES.tickets).insert(chunk);
    if (error && error.code !== '23505') throw error;
  }

  return keepIds;
}

async function resolveTickets(input: {
  accountId: string;
  ticketType: TicketType;
  keepGroupIds: Set<string>;
  keepGroupNames: Set<string>;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: openRows, error } = await supabase
    .from(TABLES.tickets)
    .select('id, group_id, group_name')
    .eq('account_id', input.accountId)
    .eq('ticket_type', input.ticketType)
    .eq('status', 'open');

  if (error) throw error;

  const now = new Date().toISOString();
  const idsToResolve: string[] = [];

  for (const row of openRows ?? []) {
    const gid = row.group_id as string | null;
    const gname = (row.group_name as string | null)?.trim().toLowerCase() ?? '';
    const gidTrim = gid?.trim() ?? '';
    const stillOpen =
      (gidTrim && input.keepGroupIds.has(gidTrim)) ||
      (!gidTrim && gname && input.keepGroupNames.has(gname));

    if (!stillOpen) {
      idsToResolve.push(row.id as string);
    }
  }

  const RESOLVE_CHUNK = 100;
  for (let i = 0; i < idsToResolve.length; i += RESOLVE_CHUNK) {
    const chunk = idsToResolve.slice(i, i + RESOLVE_CHUNK);
    const { error: updateError } = await supabase
      .from(TABLES.tickets)
      .update({ status: 'resolved', resolved_at: now })
      .in('id', chunk);
    if (updateError) throw updateError;
  }
}

function toOpenRows(
  items: { groupId: string; groupName: string | null; groupLink: string | null }[],
  describe: (label: string) => string,
): OpenTicketRowInput[] {
  return items.map((row) => {
    const label = row.groupName?.trim() || row.groupId;
    return {
      description: describe(label),
      groupLink: row.groupLink,
      groupId: row.groupId,
      groupName: row.groupName,
    };
  });
}

async function syncTicketType(
  input: ReconcileInput,
  ticketType: TicketType,
  rows: OpenTicketRowInput[],
): Promise<void> {
  const keepIds = await batchUpsertOpenTicketsByGroupId({
    accountId: input.accountId,
    brandId: input.brandId,
    platform: input.platform,
    ticketType,
    rows,
  });
  await resolveTickets({
    accountId: input.accountId,
    ticketType,
    keepGroupIds: keepIds,
    keepGroupNames: new Set(),
  });
}

/** Ticket dari master brand + daily per akun — logic = grid Y/X (accountMasterDailyCompare). */
export async function reconcileTicketsForAccount(input: ReconcileInput): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  await resolveLegacyCountMismatchTickets(input.accountId);
  await dedupeOpenTicketsForAccount(input.accountId);
  await dedupeScrapeDailyRowsForAccount(input.accountId);

  const { masterRows, dailyRows } = await loadMasterDailyForAccount({
    accountId: input.accountId,
    brandName: input.brandName,
    platform: input.platform,
  });

  if (!masterRows.length && !dailyRows.length) return;

  const breakdown = computeAccountTicketBreakdown(masterRows, dailyRows);

  await syncTicketType(
    input,
    'daily_junk_group',
    toOpenRows(breakdown.junk, ticketDescriptionEn.dailyJunk),
  );

  await syncTicketType(
    input,
    'missing_group',
    toOpenRows(breakdown.missing, ticketDescriptionEn.missingGroup),
  );

  await syncTicketType(
    input,
    'not_admin',
    toOpenRows(breakdown.notAdmin, ticketDescriptionEn.notAdmin),
  );

  if (!masterRows.length) return;

  const dupGidRows: OpenTicketRowInput[] = breakdown.duplicateGroupId.map((row) => ({
    description: ticketDescriptionEn.duplicateGroupId(row.deviceName, row.masterName),
    groupLink: row.groupLink,
    groupId: row.groupId,
    groupName: row.groupName,
  }));
  await syncTicketType(input, 'duplicate_group_id', dupGidRows);

  const dupNameRows: OpenTicketRowInput[] = breakdown.duplicateGroupName.map((row) => ({
    description: ticketDescriptionEn.duplicateGroupName(
      row.groupName?.trim() || row.groupId,
      row.groupId,
      row.clashMasterGroupId,
    ),
    groupLink: row.groupLink,
    groupId: row.groupId,
    groupName: row.groupName,
  }));
  await syncTicketType(input, 'duplicate_group_name', dupNameRows);
}

export async function reconcileTicketsAfterScrape(input: {
  accountId: string;
  platform: Platform;
  brandName: string;
}): Promise<void> {
  await reconcileTicketsForAccountFromDb(input.accountId, {
    brandName: input.brandName,
    platform: input.platform,
  });
}

/** Satu akun — dipakai setelah scrape/sync/realtime daily. */
export async function reconcileTicketsForAccountFromDb(
  accountId: string,
  options?: {
    brandName?: string;
    platform?: Platform;
  },
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: account, error } = await supabase
    .from(TABLES.messagingAccounts)
    .select('brand_id, platform, metadata')
    .eq('id', accountId)
    .maybeSingle();

  if (error) throw error;
  const brandId = account?.brand_id as string | undefined;
  if (!brandId) return;

  const meta = account?.metadata as { brand?: string } | null;
  const brandName = await resolveBrandNameForReconcileAccount({
    brandId,
    meta,
    optionsBrand: options?.brandName,
  });
  const platform = (options?.platform ?? account?.platform) as Platform | undefined;
  if (!brandName || !platform) return;

  await reconcileTicketsForAccount({
    accountId,
    brandId,
    brandName,
    platform,
  });
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  const limit = Math.max(1, concurrency);
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    await Promise.all(chunk.map((item) => worker(item)));
  }
}

/** Semua akun aktif user — buat/update open ticket dari master vs daily. */
export async function reconcileOpenTicketsForUser(
  userId: string,
  options?: { concurrency?: number },
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: accounts, error } = await supabase
    .from(TABLES.messagingAccounts)
    .select('id, brand_id, platform, metadata')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw error;
  if (!accounts?.length) return;

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

  const jobs: ReconcileInput[] = [];
  for (const row of accounts) {
    const accountId = row.id as string;
    const brandId = row.brand_id as string | undefined;
    if (!brandId) continue;

    const meta = row.metadata as { brand?: string } | null;
    const brandName = pickBrandNameForReconcile(brandId, meta, brandNameById);
    if (!brandName) continue;

    jobs.push({
      accountId,
      brandId,
      brandName,
      platform: row.platform as Platform,
    });
  }

  await mapWithConcurrency(jobs, options?.concurrency ?? 3, (job) =>
    reconcileTicketsForAccount(job),
  );
}

/** Setelah master/daily brand+platform berubah — rekonsiliasi semua akun user di brand itu. */
export async function reconcileTicketsForBrandPlatform(input: {
  userId: string;
  brandName: string;
  platform: Platform;
  concurrency?: number;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const brand = input.brandName.trim();
  if (!brand) return;

  const { data: accounts, error } = await supabase
    .from(TABLES.messagingAccounts)
    .select('id, brand_id, platform, metadata')
    .eq('user_id', input.userId)
    .eq('is_active', true)
    .eq('platform', input.platform);

  if (error) throw error;
  if (!accounts?.length) return;

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

  const brandKey = brand.toLowerCase();
  const jobs: ReconcileInput[] = [];
  for (const row of accounts) {
    const brandId = row.brand_id as string | undefined;
    if (!brandId) continue;

    const meta = row.metadata as { brand?: string } | null;
    const resolvedBrand = pickBrandNameForReconcile(brandId, meta, brandNameById);
    if (!resolvedBrand || resolvedBrand.toLowerCase() !== brandKey) continue;

    jobs.push({
      accountId: row.id as string,
      brandId,
      brandName: resolvedBrand,
      platform: input.platform,
    });
  }

  await mapWithConcurrency(jobs, input.concurrency ?? 5, (job) =>
    reconcileTicketsForAccount(job),
  );
}
