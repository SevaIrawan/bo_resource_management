import { BRAND_SELECT } from '@/config/dbColumns';
import { deactivateMessagingAccount } from '@/lib/messagingAccounts';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { Brand, Platform } from '@/types/database';

const DELETE_IN_CHUNK = 80;

async function deleteRowsInAccountChunks(
  table: string,
  column: 'account_id',
  accountIds: string[],
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || accountIds.length === 0) return;

  for (let i = 0; i < accountIds.length; i += DELETE_IN_CHUNK) {
    const chunk = accountIds.slice(i, i + DELETE_IN_CHUNK);
    const { error } = await supabase.from(table).delete().in(column, chunk);
    if (error) throw error;
  }
}

export async function ensureBrand(input: {
  userId: string;
  brandName: string;
  emptySlotCount?: number;
}): Promise<Brand> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  const name = input.brandName.trim();

  const { data: allBrands, error: listError } = await supabase
    .from(TABLES.brands)
    .select(BRAND_SELECT)
    .eq('user_id', input.userId);

  if (listError) throw listError;
  const nameKey = name.toLowerCase();
  const existing = (allBrands as Brand[] | null)?.find(
    (b) => b.name.trim().toLowerCase() === nameKey,
  );
  if (existing) {
    if (!existing.is_active) {
      const { data: revived, error: reviveError } = await supabase
        .from(TABLES.brands)
        .update({
          is_active: true,
          empty_slot_count: input.emptySlotCount ?? 3,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select(BRAND_SELECT)
        .single();
      if (reviveError) throw reviveError;
      return revived as Brand;
    }
    return existing;
  }

  const { data, error } = await supabase
    .from(TABLES.brands)
    .insert({
      user_id: input.userId,
      name,
      empty_slot_count: input.emptySlotCount ?? 3,
    })
    .select(BRAND_SELECT)
    .single();

  if (error) throw error;
  return data as Brand;
}

/**
 * Hapus brand dan SEMUA jejak di DB + sesi device — supaya Add Card nama sama tidak ambigu/duplikat.
 */
export async function removeBrandCompletely(input: {
  userId: string;
  brandId: string;
  brandName: string;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  const brandKey = input.brandName.trim();

  const { data: accounts, error: accError } = await supabase
    .from(TABLES.messagingAccounts)
    .select('id, platform')
    .eq('brand_id', input.brandId)
    .eq('user_id', input.userId);

  if (accError) throw accError;

  const accountIds = (accounts ?? []).map((row) => row.id as string);

  for (const row of accounts ?? []) {
    await deactivateMessagingAccount(
      row.id as string,
      row.platform as Platform,
      'brand_card_removed',
    );
  }

  await deleteRowsInAccountChunks(TABLES.syncActivityLogs, 'account_id', accountIds);
  await deleteRowsInAccountChunks(TABLES.scrapeRuns, 'account_id', accountIds);
  await deleteRowsInAccountChunks(TABLES.groupScrapeDaily, 'account_id', accountIds);

  const { error: dailyBrandError } = await supabase
    .from(TABLES.groupScrapeDaily)
    .delete()
    .eq('brand', brandKey);
  if (dailyBrandError) throw dailyBrandError;

  const { error: masterError } = await supabase
    .from(TABLES.groupsMaster)
    .delete()
    .eq('brand', brandKey);
  if (masterError) throw masterError;

  const { error: snapshotsError } = await supabase
    .from(TABLES.accountSnapshots)
    .delete()
    .eq('brand_id', input.brandId);
  if (snapshotsError) throw snapshotsError;

  const { error: accountsError } = await supabase
    .from(TABLES.messagingAccounts)
    .delete()
    .eq('brand_id', input.brandId)
    .eq('user_id', input.userId);
  if (accountsError) throw accountsError;

  const { error: delError } = await supabase
    .from(TABLES.brands)
    .delete()
    .eq('id', input.brandId)
    .eq('user_id', input.userId);

  if (delError) throw delError;
}

export async function loadUserBrands(userId: string): Promise<Brand[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLES.brands)
    .select(BRAND_SELECT)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data as Brand[]) ?? [];
}
