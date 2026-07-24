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
import {
  findAccountIdBySessionData,
  hasActivePlatformSession,
} from '@/lib/platformSessions';
import { dedupeScrapedGroupsByGroupId } from '@/lib/dedupeScrapedGroups';
import type { ScrapedGroupPayload } from '@/lib/dedupeScrapedGroups';
import { invalidateMasterDailyCacheForScrape } from '@/lib/masterDailyLoadCache';
import { withNetworkRetry } from '@/lib/networkRetry';
import { getSupabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';
import type { Platform } from '@/types/database';
import type { MessagingAccount } from '@/types/database';

export type { ScrapedGroupPayload } from '@/lib/dedupeScrapedGroups';

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

  const brandMatches = (metaBrand: string | undefined) => {
    if (!metaBrand) return true;
    return metaBrand.trim().toLowerCase() === brandKey.toLowerCase();
  };

  const labelMatches = (label: string) => label.trim().toLowerCase() === accKey.toLowerCase();

  const candidates = (rows as MessagingAccount[] | null)?.filter((row) => {
    const meta = row.metadata as { brand?: string } | null;
    if (!brandMatches(meta?.brand)) return false;
    if (!labelMatches(String(row.label))) return false;
    const dbPhone = readPhoneFromAccount(row);
    if (!phoneRaw) return true;
    if (!dbPhone) return true;
    return phonesMatch(dbPhone, phoneRaw);
  });

  if (candidates?.length === 1) {
    const match = candidates[0];
    const dbPhone = readPhoneFromAccount(match);
    if (hasValidAccountPhone(phoneRaw) && (!dbPhone || !phonesMatch(dbPhone, phoneRaw))) {
      await updateMessagingAccountPhone(match.id, phoneRaw);
    }
    return match.id;
  }

  if (candidates && candidates.length > 1) {
    for (const row of candidates) {
      if (await hasActivePlatformSession(row.id)) return row.id;
    }
    const dbPhone = readPhoneFromAccount(candidates[0]);
    if (hasValidAccountPhone(phoneRaw) && (!dbPhone || !phonesMatch(dbPhone, phoneRaw))) {
      await updateMessagingAccountPhone(candidates[0].id, phoneRaw);
    }
    return candidates[0].id;
  }

  const byLabelOnly = (rows as MessagingAccount[] | null)?.filter((row) =>
    labelMatches(String(row.label)),
  );
  if (byLabelOnly?.length === 1) {
    const match = byLabelOnly[0];
    const dbPhone = readPhoneFromAccount(match);
    if (hasValidAccountPhone(phoneRaw) && (!dbPhone || !phonesMatch(dbPhone, phoneRaw))) {
      await updateMessagingAccountPhone(match.id, phoneRaw);
    }
    return match.id;
  }
  if (byLabelOnly && byLabelOnly.length > 1) {
    for (const row of byLabelOnly) {
      if (await hasActivePlatformSession(row.id)) return row.id;
    }
  }

  if (input.localId?.trim()) {
    const fromSession = await findAccountIdBySessionData(input.localId.trim(), input.platform);
    if (fromSession) return fromSession;
    if (candidateId && candidateId !== input.localId) {
      const fromCandidate = await findAccountIdBySessionData(candidateId, input.platform);
      if (fromCandidate) return fromCandidate;
    }
  }

  const sameLabelAnyUser = (rows as MessagingAccount[] | null)?.filter((row) =>
    labelMatches(String(row.label)),
  );
  if (sameLabelAnyUser?.length) {
    for (const row of sameLabelAnyUser) {
      if (await hasActivePlatformSession(row.id)) return row.id;
    }
    return sameLabelAnyUser[0].id;
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
    opsRole: 'gcs',
    brand: brandKey,
    brandId: brand.id,
  });
}

export interface ScrapeDailyWriteResult {
  /** Total baris daily (= snapshot device, sudah dedupe group_id) */
  count: number;
  /** Baris di master brand setelah rebuild */
  masterCount: number;
  /** Grup admin di device (setelah dedupe — sama data yang ditulis RPC) */
  deviceAdminCount: number;
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
 * scrape device → RPC rm_commit_account_scrape (DELETE daily + INSERT + rebuild master, atomik)
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

  const uniqueGroups = dedupeScrapedGroupsByGroupId(input.groups);
  if (!uniqueGroups.length) {
    throw new Error('SCRAPER_NO_GROUPS');
  }

  const scrapeDate = new Date().toISOString().slice(0, 10);
  const scrapedAt = new Date().toISOString();
  const phone = input.phoneNumber?.trim() ?? '';
  if (input.platform === 'whatsapp' && !hasValidAccountPhone(phone)) {
    throw new Error('PHONE_MISSING');
  }

  const rows = buildScrapeRows({
    accountId: input.accountId,
    platform: input.platform,
    brand: input.brand,
    accName: input.accName,
    phoneNumber: phone,
    scrapeDate,
    scrapedAt,
    groups: uniqueGroups,
  });

  const brand = input.brand.trim();
  const commitTimeoutMs = Math.min(
    600_000,
    Math.max(120_000, 30_000 + uniqueGroups.length * 40),
  );

  const commitResult = await withNetworkRetry('Commit scrape daily', async () => {
    const result = await withTimeout(
      (async () => {
        const { data, error } = await supabase.rpc('rm_commit_account_scrape', {
          p_account_id: input.accountId,
          p_brand: brand,
          p_platform: input.platform,
          p_rows: rows,
        });
        return { data, error };
      })(),
      commitTimeoutMs,
      'Commit scrape daily',
    );
    if (result.error) {
      throw new Error(`SCRAPER_DB_COMMIT: ${result.error.message}`);
    }
    return result;
  });

  const data = commitResult.data;

  const commit = (data ?? {}) as {
    daily_count?: number;
    master_inserted?: number;
  };

  invalidateMasterDailyCacheForScrape({
    accountId: input.accountId,
    brand,
    platform: input.platform,
  });

  return {
    count: commit.daily_count ?? rows.length,
    masterCount: commit.master_inserted ?? 0,
    deviceAdminCount: uniqueGroups.filter((g) => g.is_admin === 'yes').length,
    scrapeDate,
    scrapedAt,
  };
}
