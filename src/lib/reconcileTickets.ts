import { resolveBrandStandardTotal } from '@/lib/brandStandardCount';
import { dedupeDailyRowsByGroupId, dedupeScrapeDailyRowsForAccount } from '@/lib/dedupeScrapeDaily';
import { TABLES } from '@/config/tables';
import { ticketDescriptionEn } from '@/lib/ticketNote';
import { openTicketDedupeKey } from '@/lib/ticketDedupe';
import { getSupabase } from '@/lib/supabase';
import type { GroupsMaster, Platform, TicketType } from '@/types/database';

interface ReconcileInput {
  accountId: string;
  brandId: string;
  brandName: string;
  platform: Platform;
  /** Y device — dari scrape/sync terbaru; kalau diisi, dipakai untuk group_count_mismatch */
  deviceY?: number;
}

interface DailyRow {
  group_id: string;
  group_name: string | null;
  invite_link: string | null;
  is_admin: string;
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

async function upsertOpenTicket(input: {
  accountId: string;
  brandId: string;
  platform: Platform;
  ticketType: TicketType;
  description: string;
  groupLink?: string | null;
  groupId?: string | null;
  groupName?: string | null;
}): Promise<void> {
  await batchUpsertOpenTicketsByGroupId({
    accountId: input.accountId,
    brandId: input.brandId,
    platform: input.platform,
    ticketType: input.ticketType,
    rows: [
      {
        description: input.description,
        groupLink: input.groupLink,
        groupId: input.groupId,
        groupName: input.groupName,
      },
    ],
  });
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
  const keepIds = new Set<string>();
  if (!supabase || !input.rows.length) return keepIds;

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
    if (gid) {
      existingGids.add(gid);
      keepIds.add(gid);
    }
  }

  const toInsert: Record<string, unknown>[] = [];
  for (const row of input.rows) {
    const gid = String(row.groupId ?? '').trim();
    if (!gid || existingGids.has(gid)) {
      if (gid) keepIds.add(gid);
      continue;
    }
    existingGids.add(gid);
    keepIds.add(gid);
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
  for (const row of openRows ?? []) {
    const gid = row.group_id as string | null;
    const gname = (row.group_name as string | null)?.trim().toLowerCase() ?? '';
    const stillOpen =
      (gid && input.keepGroupIds.has(gid)) ||
      (!gid && gname && input.keepGroupNames.has(gname));

    if (stillOpen) continue;

    await supabase
      .from(TABLES.tickets)
      .update({ status: 'resolved', resolved_at: now })
      .eq('id', row.id as string);
  }
}

async function detectFraudTickets(input: ReconcileInput): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const brand = input.brandName.trim();

  const [{ data: master }, { data: daily }] = await Promise.all([
    supabase
      .from(TABLES.groupsMaster)
      .select('group_id, group_name, invite_link')
      .eq('brand', brand)
      .eq('platform', input.platform),
    supabase
      .from(TABLES.groupScrapeDaily)
      .select('group_id, group_name, invite_link, is_admin')
      .eq('account_id', input.accountId),
  ]);

  const masterRows = (master ?? []) as Pick<GroupsMaster, 'group_id' | 'group_name' | 'invite_link'>[];
  const dailyRows = dedupeDailyRowsByGroupId((daily ?? []) as DailyRow[]);

  const masterByGid = new Map(
    masterRows.map((m) => [String(m.group_id).trim(), m]),
  );

  const dupGidKeep = new Set<string>();
  const dupNameKeep = new Set<string>();

  for (const d of dailyRows) {
    const gid = String(d.group_id ?? '').trim();
    const gname = String(d.group_name ?? '').trim();
    if (!gid) continue;

    const canon = masterByGid.get(gid);
    if (canon) {
      const canonName = String(canon.group_name ?? '').trim();
      if (gname && canonName && gname.toLowerCase() !== canonName.toLowerCase()) {
        await upsertOpenTicket({
          accountId: input.accountId,
          brandId: input.brandId,
          platform: input.platform,
          ticketType: 'duplicate_group_id',
          description: ticketDescriptionEn.duplicateGroupId(gname, canonName),
          groupLink: d.invite_link,
          groupId: gid,
          groupName: gname,
        });
        dupGidKeep.add(gid);
      }
    }
  }

  await resolveTickets({
    accountId: input.accountId,
    ticketType: 'duplicate_group_id',
    keepGroupIds: dupGidKeep,
    keepGroupNames: new Set(),
  });

  const nameToGids = new Map<string, Set<string>>();
  for (const m of masterRows) {
    const name = String(m.group_name ?? '').trim().toLowerCase();
    const gid = String(m.group_id ?? '').trim();
    if (!name || !gid) continue;
    if (!nameToGids.has(name)) nameToGids.set(name, new Set());
    nameToGids.get(name)!.add(gid);
  }

  for (const [name, gids] of nameToGids) {
    if (gids.size < 2) continue;

    for (const d of dailyRows) {
      const gname = String(d.group_name ?? '').trim().toLowerCase();
      const gid = String(d.group_id ?? '').trim();
      if (gname !== name || !gids.has(gid)) continue;

      await upsertOpenTicket({
        accountId: input.accountId,
        brandId: input.brandId,
        platform: input.platform,
        ticketType: 'duplicate_group_name',
        description: ticketDescriptionEn.duplicateGroupName(name),
        groupLink: d.invite_link,
        groupId: gid,
        groupName: d.group_name,
      });
      dupNameKeep.add(gid);
    }
  }

  await resolveTickets({
    accountId: input.accountId,
    ticketType: 'duplicate_group_name',
    keepGroupIds: dupNameKeep,
    keepGroupNames: new Set(),
  });
}

/** Ticket dari master brand + daily per akun (join by group_id). */
export async function reconcileTicketsForAccount(input: ReconcileInput): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  await dedupeOpenTicketsForAccount(input.accountId);
  await dedupeScrapeDailyRowsForAccount(input.accountId);

  const brand = input.brandName.trim();

  const [{ data: master }, { data: daily }] = await Promise.all([
    supabase
      .from(TABLES.groupsMaster)
      .select('group_id, group_name, invite_link')
      .eq('brand', brand)
      .eq('platform', input.platform),
    supabase
      .from(TABLES.groupScrapeDaily)
      .select('group_id, group_name, invite_link, is_admin')
      .eq('account_id', input.accountId),
  ]);

  const masterRows = (master ?? []) as Pick<GroupsMaster, 'group_id' | 'group_name' | 'invite_link'>[];
  const dailyRows = dedupeDailyRowsByGroupId((daily ?? []) as DailyRow[]);
  const dailyByGid = new Map(dailyRows.map((d) => [String(d.group_id).trim(), d]));

  const masterGids = new Set(
    masterRows.map((m) => String(m.group_id ?? '').trim()).filter(Boolean),
  );

  const junkRows: OpenTicketRowInput[] = [];
  for (const d of dailyRows) {
    const gid = String(d.group_id ?? '').trim();
    if (!gid || masterGids.has(gid)) continue;
    const label = d.group_name?.trim() || gid;
    junkRows.push({
      description: ticketDescriptionEn.dailyJunk(label),
      groupLink: d.invite_link,
      groupId: gid,
      groupName: d.group_name,
    });
  }
  const junkKeepIds = await batchUpsertOpenTicketsByGroupId({
    accountId: input.accountId,
    brandId: input.brandId,
    platform: input.platform,
    ticketType: 'daily_junk_group',
    rows: junkRows,
  });
  await resolveTickets({
    accountId: input.accountId,
    ticketType: 'daily_junk_group',
    keepGroupIds: junkKeepIds,
    keepGroupNames: new Set(),
  });

  const missingRows: OpenTicketRowInput[] = [];
  const notAdminRows: OpenTicketRowInput[] = [];

  for (const m of masterRows) {
    const gid = String(m.group_id ?? '').trim();
    if (!gid) continue;

    const d = dailyByGid.get(gid);
    const label = m.group_name?.trim() || gid;

    if (!d) {
      missingRows.push({
        description: ticketDescriptionEn.missingGroup(label),
        groupLink: m.invite_link,
        groupId: gid,
        groupName: m.group_name,
      });
      continue;
    }

    if (d.is_admin !== 'yes') {
      notAdminRows.push({
        description: ticketDescriptionEn.notAdmin(label),
        groupLink: m.invite_link ?? d.invite_link,
        groupId: gid,
        groupName: m.group_name ?? d.group_name,
      });
    }
  }

  const missingKeepIds = await batchUpsertOpenTicketsByGroupId({
    accountId: input.accountId,
    brandId: input.brandId,
    platform: input.platform,
    ticketType: 'missing_group',
    rows: missingRows,
  });
  await resolveTickets({
    accountId: input.accountId,
    ticketType: 'missing_group',
    keepGroupIds: missingKeepIds,
    keepGroupNames: new Set(),
  });

  const notAdminKeepIds = await batchUpsertOpenTicketsByGroupId({
    accountId: input.accountId,
    brandId: input.brandId,
    platform: input.platform,
    ticketType: 'not_admin',
    rows: notAdminRows,
  });
  await resolveTickets({
    accountId: input.accountId,
    ticketType: 'not_admin',
    keepGroupIds: notAdminKeepIds,
    keepGroupNames: new Set(),
  });

  if (masterRows.length) {
    await detectFraudTickets(input);
  }

  const { data: snap, error: snapError } = await supabase
    .from(TABLES.accountSnapshots)
    .select('groups_current, groups_total, session_status')
    .eq('account_id', input.accountId)
    .maybeSingle();

  if (snapError) throw snapError;

  /** Y untuk count mismatch — max(daily, snapshot, input) agar selaras kartu 30/1893. */
  const dailyY = dailyRows.length;
  const snapY =
    snap?.session_status === 'valid' ? Math.max(0, Number(snap?.groups_current ?? 0)) : 0;
  const deviceY =
    input.deviceY !== undefined && input.deviceY >= 0
      ? input.deviceY
      : Math.max(dailyY, snapY);
  const brandX = await resolveBrandStandardTotal(
    input.brandId,
    input.platform,
    Number(snap?.groups_total ?? 0),
    brand,
  );

  if (brandX > 0 && deviceY !== brandX) {
    await upsertOpenTicket({
      accountId: input.accountId,
      brandId: input.brandId,
      platform: input.platform,
      ticketType: 'group_count_mismatch',
      description: ticketDescriptionEn.countMismatch(deviceY, brandX),
    });
  } else if (brandX > 0) {
    const { data: openMismatch } = await supabase
      .from(TABLES.tickets)
      .select('id')
      .eq('account_id', input.accountId)
      .eq('ticket_type', 'group_count_mismatch')
      .eq('status', 'open')
      .maybeSingle();

    if (openMismatch?.id) {
      await supabase
        .from(TABLES.tickets)
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', openMismatch.id as string);
    }
  }
}

export async function reconcileTicketsAfterScrape(input: {
  accountId: string;
  platform: Platform;
  brandName: string;
  deviceY?: number;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: account, error } = await supabase
    .from(TABLES.messagingAccounts)
    .select('brand_id, metadata')
    .eq('id', input.accountId)
    .maybeSingle();

  if (error) throw error;
  const brandId = account?.brand_id as string | undefined;
  if (!brandId) return;

  const meta = account?.metadata as { brand?: string } | null;
  const brandName = input.brandName.trim() || meta?.brand?.trim() || '';

  if (!brandName) return;

  await reconcileTicketsForAccount({
    accountId: input.accountId,
    brandId,
    brandName,
    platform: input.platform,
    deviceY: input.deviceY,
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

  const accountIds = accounts.map((row) => row.id as string);
  const deviceYByAccount = new Map<string, number>();
  if (accountIds.length) {
    const { data: snaps, error: snapError } = await supabase
      .from(TABLES.accountSnapshots)
      .select('account_id, groups_current, session_status')
      .in('account_id', accountIds);
    if (snapError) throw snapError;
    for (const snap of snaps ?? []) {
      const id = snap.account_id as string;
      if (snap.session_status !== 'valid') continue;
      deviceYByAccount.set(id, Math.max(0, Number(snap.groups_current ?? 0)));
    }
  }

  const jobs: ReconcileInput[] = [];
  for (const row of accounts) {
    const accountId = row.id as string;
    const brandId = row.brand_id as string | undefined;
    if (!brandId) continue;

    const meta = row.metadata as { brand?: string } | null;
    const brandName = meta?.brand?.trim() || brandNameById.get(brandId) || '';
    if (!brandName) continue;

    jobs.push({
      accountId,
      brandId,
      brandName,
      platform: row.platform as Platform,
      deviceY: deviceYByAccount.get(accountId),
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
    const resolvedBrand = meta?.brand?.trim() || brandNameById.get(brandId) || '';
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
