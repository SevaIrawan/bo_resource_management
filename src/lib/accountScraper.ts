import { SCRAPER_WRITE_TABLE } from '@/config/scraperPolicy';
import { MESSAGING_ACCOUNT_MATCH_SELECT } from '@/config/dbColumns';
import { TABLES } from '@/config/tables';
import {
  hasValidAccountPhone,
  readPhoneFromAccount,
  updateMessagingAccountPhone,
} from '@/lib/accountPhone';
import { buildGroupRowId } from '@/lib/groupRowId';
import { phonesMatch } from '@/lib/phoneNormalize';
import { ensureBrand } from '@/lib/brands';
import { createMessagingAccount } from '@/lib/messagingAccounts';
import { rebuildBrandGroupsMaster } from '@/lib/syncMasterAfterScrape';
import { getSupabase } from '@/lib/supabase';
import type { Platform } from '@/types/database';
import type { MessagingAccount } from '@/types/database';

export interface ScrapedGroupPayload {
  group_id: string;
  group_name: string;
  invite_link: string | null;
  is_admin: 'yes' | 'no';
  member_count: number;
  admin_count: number;
  owner_count: number;
}

export async function resolveMessagingAccountId(input: {
  userId: string;
  platform: Platform;
  brand: string;
  accName: string;
  phoneNumber?: string;
  localId?: string;
}): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  const brandKey = input.brand.trim();
  const accKey = input.accName.trim();
  const phoneRaw = input.phoneNumber?.trim() ?? '';

  const candidateId = input.localId?.startsWith('acc-')
    ? input.localId.slice(4)
    : input.localId;

  if (candidateId && /^[0-9a-f-]{36}$/i.test(candidateId)) {
    const { data: existingById, error: byIdError } = await supabase
      .from(TABLES.messagingAccounts)
      .select(MESSAGING_ACCOUNT_MATCH_SELECT)
      .eq('id', candidateId)
      .maybeSingle();

    if (byIdError) throw byIdError;

    if (existingById?.id) {
      const row = existingById as MessagingAccount;
      const dbPhone = readPhoneFromAccount(row);
      if (hasValidAccountPhone(phoneRaw) && (!dbPhone || !phonesMatch(dbPhone, phoneRaw))) {
        await updateMessagingAccountPhone(row.id, phoneRaw);
      }
      return row.id;
    }
  }

  const { data: rows, error } = await supabase
    .from(TABLES.messagingAccounts)
    .select(MESSAGING_ACCOUNT_MATCH_SELECT)
    .eq('user_id', input.userId)
    .eq('platform', input.platform);

  if (error) throw error;

  const match = (rows as MessagingAccount[] | null)?.find((row) => {
    const meta = row.metadata as { brand?: string } | null;
    if (meta?.brand !== brandKey) return false;
    if (String(row.label).trim() !== accKey) return false;
    const dbPhone = readPhoneFromAccount(row);
    if (!phoneRaw) return true;
    if (!dbPhone) return true;
    return phonesMatch(dbPhone, phoneRaw);
  });

  if (match?.id) {
    const dbPhone = readPhoneFromAccount(match);
    if (hasValidAccountPhone(phoneRaw) && (!dbPhone || !phonesMatch(dbPhone, phoneRaw))) {
      await updateMessagingAccountPhone(match.id, phoneRaw);
    }
    return match.id;
  }

  if (!hasValidAccountPhone(phoneRaw)) {
    throw new Error('PHONE_MISSING');
  }

  const brand = await ensureBrand({ userId: input.userId, brandName: brandKey });

  return createMessagingAccount({
    userId: input.userId,
    platform: input.platform,
    label: accKey,
    phoneNumber: phoneRaw,
    brand: brandKey,
    brandId: brand.id,
  });
}

export interface ScrapeDailyWriteResult {
  /** Total baris daily (= snapshot device) */
  count: number;
  /** Baris di master brand setelah rebuild */
  masterCount: number;
  scrapeDate: string;
  scrapedAt: string;
}

function buildScrapeRows(input: {
  accountId: string;
  platform: Platform;
  brand: string;
  accName: string;
  phoneNumber: string;
  scrapeDate: string;
  scrapedAt: string;
  groups: ScrapedGroupPayload[];
}) {
  const brand = input.brand.trim();
  const accName = input.accName.trim();

  return input.groups.map((group) => ({
    id: buildGroupRowId(group.group_id, accName),
    account_id: input.accountId,
    group_name: group.group_name,
    group_id: group.group_id,
    invite_link: group.invite_link,
    owner_count: group.owner_count,
    admin_count: group.admin_count,
    member_count: group.member_count,
    is_admin: group.is_admin,
    platform: input.platform,
    scrape_date: input.scrapeDate,
    scraped_at: input.scrapedAt,
    created_at: input.scrapedAt,
    brand,
    acc_name: accName,
    phone_number: input.phoneNumber,
  }));
}

/**
 * Pipeline setiap scrape:
 * scrape → DELETE daily (account_id) → INSERT daily (device penuh)
 * → rebuild master brand+platform (dedupe + link valid)
 */
export async function writeScrapeDailyRows(input: {
  accountId: string;
  platform: Platform;
  brand: string;
  accName: string;
  phoneNumber?: string;
  groups: ScrapedGroupPayload[];
}): Promise<ScrapeDailyWriteResult> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  if (!input.groups.length) {
    throw new Error('SCRAPER_NO_GROUPS');
  }

  const scrapeDate = new Date().toISOString().slice(0, 10);
  const scrapedAt = new Date().toISOString();
  const phone = input.phoneNumber?.trim();
  if (!phone || !hasValidAccountPhone(phone)) {
    throw new Error('PHONE_MISSING');
  }

  const { error: deleteDailyError } = await supabase
    .from(SCRAPER_WRITE_TABLE)
    .delete()
    .eq('account_id', input.accountId);

  if (deleteDailyError) {
    throw new Error(`SCRAPER_DB_DELETE_DAILY: ${deleteDailyError.message}`);
  }

  const rows = buildScrapeRows({
    accountId: input.accountId,
    platform: input.platform,
    brand: input.brand,
    accName: input.accName,
    phoneNumber: phone,
    scrapeDate,
    scrapedAt,
    groups: input.groups,
  });

  const { error: insertError } = await supabase.from(SCRAPER_WRITE_TABLE).insert(rows);
  if (insertError) {
    throw new Error(`SCRAPER_DB_WRITE: ${insertError.message}`);
  }

  const { masterInserted } = await rebuildBrandGroupsMaster({
    brand: input.brand.trim(),
    platform: input.platform,
  });

  return {
    count: rows.length,
    masterCount: masterInserted,
    scrapeDate,
    scrapedAt,
  };
}
