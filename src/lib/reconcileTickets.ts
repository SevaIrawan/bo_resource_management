import { resolveBrandStandardTotal } from '@/lib/brandStandardCount';
import { TABLES } from '@/config/tables';
import { ticketDescriptionEn } from '@/lib/ticketNote';
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
  const supabase = getSupabase();
  if (!supabase) return;

  let query = supabase
    .from(TABLES.tickets)
    .select('id')
    .eq('account_id', input.accountId)
    .eq('ticket_type', input.ticketType)
    .eq('status', 'open');

  if (input.groupId) {
    query = query.eq('group_id', input.groupId);
  } else if (input.groupName) {
    query = query.eq('group_name', input.groupName);
  }

  const { data: existing } = await query.maybeSingle();
  if (existing?.id) return;

  const { error } = await supabase.from(TABLES.tickets).insert({
    account_id: input.accountId,
    brand_id: input.brandId,
    platform: input.platform,
    ticket_type: input.ticketType,
    status: 'open',
    description: input.description,
    group_link: input.groupLink ?? null,
    group_id: input.groupId ?? null,
    group_name: input.groupName ?? null,
  });

  if (error) throw error;
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
  const dailyRows = (daily ?? []) as DailyRow[];

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
  const dailyRows = (daily ?? []) as DailyRow[];
  const dailyByGid = new Map(dailyRows.map((d) => [String(d.group_id).trim(), d]));

  const masterGids = new Set(
    masterRows.map((m) => String(m.group_id ?? '').trim()).filter(Boolean),
  );

  const junkKeepIds = new Set<string>();
  for (const d of dailyRows) {
    const gid = String(d.group_id ?? '').trim();
    if (!gid || masterGids.has(gid)) continue;

    const label = d.group_name?.trim() || gid;
    await upsertOpenTicket({
      accountId: input.accountId,
      brandId: input.brandId,
      platform: input.platform,
      ticketType: 'daily_junk_group',
      description: ticketDescriptionEn.dailyJunk(label),
      groupLink: d.invite_link,
      groupId: gid,
      groupName: d.group_name,
    });
    junkKeepIds.add(gid);
  }

  await resolveTickets({
    accountId: input.accountId,
    ticketType: 'daily_junk_group',
    keepGroupIds: junkKeepIds,
    keepGroupNames: new Set(),
  });

  const missingKeepIds = new Set<string>();
  const notAdminKeepIds = new Set<string>();

  for (const m of masterRows) {
    const gid = String(m.group_id ?? '').trim();
    if (!gid) continue;

    const d = dailyByGid.get(gid);
    const label = m.group_name?.trim() || gid;

    if (!d) {
      await upsertOpenTicket({
        accountId: input.accountId,
        brandId: input.brandId,
        platform: input.platform,
        ticketType: 'missing_group',
        description: ticketDescriptionEn.missingGroup(label),
        groupLink: m.invite_link,
        groupId: gid,
        groupName: m.group_name,
      });
      missingKeepIds.add(gid);
      continue;
    }

    if (d.is_admin !== 'yes') {
      await upsertOpenTicket({
        accountId: input.accountId,
        brandId: input.brandId,
        platform: input.platform,
        ticketType: 'not_admin',
        description: ticketDescriptionEn.notAdmin(label),
        groupLink: m.invite_link ?? d.invite_link,
        groupId: gid,
        groupName: m.group_name ?? d.group_name,
      });
      notAdminKeepIds.add(gid);
    }
  }

  await resolveTickets({
    accountId: input.accountId,
    ticketType: 'missing_group',
    keepGroupIds: missingKeepIds,
    keepGroupNames: new Set(),
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

  const deviceY =
    input.deviceY !== undefined
      ? input.deviceY
      : snap?.session_status === 'valid'
        ? Number(snap?.groups_current ?? 0)
        : 0;
  const brandX = await resolveBrandStandardTotal(
    input.brandId,
    input.platform,
    Number(snap?.groups_total ?? 0),
    brand,
  );

  const sessionOk =
    input.deviceY !== undefined || snap?.session_status === 'valid';

  if (brandX > 0 && sessionOk && deviceY !== brandX) {
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
