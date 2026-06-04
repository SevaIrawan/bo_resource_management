/**
 * Setelah Sync — daftar group_id dari device diselaraskan ke daily agar issue ticket
 * (missing_group, dll.) ikut update, tidak hanya kolom Groups Y/X di kartu akun.
 */
import { todayScrapeDate } from '@/lib/accountMonitoringEngine';
import { hasValidAccountPhone } from '@/lib/accountPhone';
import { buildGroupRowId } from '@/lib/groupRowId';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { Platform } from '@/types/database';

const INSERT_CHUNK = 150;

export async function mergeDeviceGroupIdsIntoDaily(input: {
  accountId: string;
  brand: string;
  accName: string;
  phoneNumber: string;
  platform: Platform;
  groupIds: string[];
}): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const uniqueIds = [
    ...new Set(input.groupIds.map((gid) => gid.trim()).filter(Boolean)),
  ];
  if (!uniqueIds.length) return 0;

  const { data: existing, error: existingError } = await supabase
    .from(TABLES.groupScrapeDaily)
    .select('group_id')
    .eq('account_id', input.accountId);

  if (existingError) throw existingError;

  const existingGids = new Set(
    (existing ?? []).map((row) => String(row.group_id ?? '').trim()).filter(Boolean),
  );

  const newGids = uniqueIds.filter((gid) => !existingGids.has(gid));
  if (!newGids.length) return 0;

  const brand = input.brand.trim();
  const accName = input.accName.trim();
  const phone = hasValidAccountPhone(input.phoneNumber)
    ? input.phoneNumber.trim()
    : '0';

  const { data: masterRows, error: masterError } = await supabase
    .from(TABLES.groupsMaster)
    .select('group_id, group_name, invite_link')
    .eq('brand', brand)
    .eq('platform', input.platform);

  if (masterError) throw masterError;

  const masterByGid = new Map(
    (masterRows ?? []).map((row) => [String(row.group_id ?? '').trim(), row]),
  );

  const scrapeDate = todayScrapeDate();
  const scrapedAt = new Date().toISOString();

  const rows = newGids.map((gid) => {
    const canon = masterByGid.get(gid);
    return {
      id: buildGroupRowId(gid, accName),
      account_id: input.accountId,
      group_id: gid,
      group_name: String(canon?.group_name ?? gid),
      invite_link: canon?.invite_link ?? null,
      owner_count: 0,
      admin_count: 0,
      member_count: 0,
      is_admin: 'no' as const,
      platform: input.platform,
      scrape_date: scrapeDate,
      scraped_at: scrapedAt,
      created_at: scrapedAt,
      brand,
      acc_name: accName,
      phone_number: phone,
    };
  });

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from(TABLES.groupScrapeDaily).upsert(chunk, {
      onConflict: 'id,scrape_date',
    });
    if (error) throw error;
  }

  return rows.length;
}
