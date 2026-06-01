import { createEmptyAccountSlots, createEmptyBrandGroup, rebuildGroupMetrics } from '@/lib/accountBrandUtils';
import {
  brandPlatformCacheKey,
  buildStandardCountByPlatformFromRows,
  fetchBrandStandardTotalsByPlatform,
} from '@/lib/brandStandardCount';
import {
  applyMasterStatsToAccountRow,
  buildMetricsFromScrapeDaily,
  fetchMasterGroupStatsBatch,
} from '@/lib/accountSyncData';
import { isMisalignedFromSyncResult } from '@/lib/accountDisplayMetrics';
import {
  loadAccountSnapshotsForUser,
  upsertAccountSnapshot,
} from '@/lib/accountSnapshots';
import { MESSAGING_ACCOUNT_SELECT } from '@/config/dbColumns';
import { readPhoneFromAccount } from '@/lib/accountPhone';
import { loadUserBrands } from '@/lib/brands';
import { TABLES } from '@/config/tables';
import { fetchLastActivityAtByAccount } from '@/lib/lastAccountUpdate';
import { fetchActiveSessionAccountIdSet } from '@/lib/platformSessions';
import { getSupabase } from '@/lib/supabase';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
import type { AccountSnapshot, MessagingAccount, Platform } from '@/types/database';

function brandIdFromName(brandName: string) {
  return `brand-${brandName.trim().toLowerCase().replace(/\s+/g, '-')}`;
}

function accountRowFromDb(
  account: MessagingAccount,
  brandName: string,
  hasSession: boolean,
  snap?: AccountSnapshot,
): AccountBrandRow {
  // Badge session = platform_sessions aktif; akun baru tanpa baris aktif → default INVALID.
  const sessionStatus = hasSession ? 'valid' : 'invalid';
  const status = sessionStatus === 'valid' ? 'active' : 'logout';

  const base: AccountBrandRow = {
    id: account.id,
    platform: account.platform,
    accountName: account.label,
    phoneNumber: readPhoneFromAccount(account),
    brandName,
    status,
    groupsCurrent: 0,
    groupsTotal: 0,
    adminCurrent: 0,
    adminTotal: 0,
    sessionStatus,
    actionProcess: null,
    syncState: 'pending',
    isMisaligned: false,
  };

  if (!snap) return base;
  return {
    ...base,
    syncState: snap.sync_state === 'synced' ? 'synced' : base.syncState,
    lastSyncAt: snap.last_sync_at ?? base.lastSyncAt,
    isMisaligned: false,
    sessionStatus,
    status,
  };
}

export async function loadAccountMonitoringGroups(userId: string): Promise<AccountBrandGroup[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const [brands, accounts, snapshots] = await Promise.all([
    loadUserBrands(userId),
    supabase
      .from(TABLES.messagingAccounts)
      .select(MESSAGING_ACCOUNT_SELECT)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error;
        return (data as MessagingAccount[]) ?? [];
      }),
    loadAccountSnapshotsForUser(userId),
  ]);

  const brandById = new Map(brands.map((b) => [b.id, b]));
  const accountsByBrand = new Map<string, MessagingAccount[]>();

  for (const account of accounts) {
    const list = accountsByBrand.get(account.brand_id) ?? [];
    list.push(account);
    accountsByBrand.set(account.brand_id, list);
  }

  const masterByAccount = await fetchMasterGroupStatsBatch(
    accounts.map((a) => {
      const brand = brandById.get(a.brand_id);
      return {
        id: a.id,
        brandName: brand?.name ?? String((a.metadata as { brand?: string })?.brand ?? ''),
        platform: a.platform,
      };
    }),
  );

  const accountIds = accounts.map((a) => a.id);
  const [activeSessionIds, lastActivityAtByAccount] = await Promise.all([
    fetchActiveSessionAccountIdSet(accountIds),
    fetchLastActivityAtByAccount(accountIds),
  ]);
  const platformsByBrand = new Map<string, Platform[]>();
  for (const account of accounts) {
    const list = platformsByBrand.get(account.brand_id) ?? [];
    if (!list.includes(account.platform)) list.push(account.platform);
    platformsByBrand.set(account.brand_id, list);
  }
  const brandStandardByPlatform = await fetchBrandStandardTotalsByPlatform(
    brands,
    platformsByBrand,
  );

  const groups: AccountBrandGroup[] = [];

  for (const brand of brands) {
    const brandAccounts = accountsByBrand.get(brand.id) ?? [];
    const rows: AccountBrandRow[] = [];
    const standardByPlatform: Partial<Record<Platform, number>> = {};

    for (const account of brandAccounts) {
      const brandX =
        brandStandardByPlatform.get(brandPlatformCacheKey(brand.id, account.platform)) ?? 0;
      if (brandX > 0) standardByPlatform[account.platform] = brandX;

      const snap = snapshots.get(account.id);
      const hasSession = activeSessionIds.has(account.id);
      let row = accountRowFromDb(account, brand.name, hasSession, snap);
      const master = masterByAccount.get(account.id);

      const { result } = await buildMetricsFromScrapeDaily({
        accountId: account.id,
        brand: brand.name,
        platform: account.platform,
        brandStandard: brandX > 0 ? brandX : undefined,
        sessionValid: hasSession,
      });
      const lastActivityAt = lastActivityAtByAccount.get(account.id);
      row = {
        ...row,
        groupsCurrent: result.groupsCurrent,
        groupsTotal: result.groupsTotal,
        adminCurrent: result.adminCurrent,
        adminTotal: result.adminTotal,
        isMisaligned: isMisalignedFromSyncResult(result),
        syncState: lastActivityAt || result.groupsCurrent > 0 || snap ? 'synced' : row.syncState,
        lastSyncAt: lastActivityAt ?? null,
      };

      if (master && !hasSession) {
        row = applyMasterStatsToAccountRow(row, master, { brandStandard: brandX });
      }

      if (master && hasSession) {
        if (
          !snap ||
          snap.groups_current !== row.groupsCurrent ||
          snap.admin_current !== row.adminCurrent ||
          snap.groups_total !== row.groupsTotal
        ) {
          void upsertAccountSnapshot({
            account: row,
            brandId: brand.id,
            result: {
              groupsCurrent: row.groupsCurrent,
              groupsTotal: row.groupsTotal,
              adminCurrent: row.adminCurrent,
              adminTotal: row.adminTotal,
              sessionStatus: 'valid',
            },
            brandStandard: brandX,
            masterTotal: master.joinedInMaster,
          });
        }
      } else if (brandX > 0 && row.groupsTotal !== brandX) {
        row = { ...row, groupsTotal: brandX, adminTotal: brandX };
      }
      rows.push(row);
    }

    const groupId = brandIdFromName(brand.name);
    const base = createEmptyBrandGroup(brand.name);
    const withMetrics = rebuildGroupMetrics({
      ...base,
      id: groupId,
      brandName: brand.name,
      brandLabel: brand.name,
      accounts: rows,
      emptySlots: createEmptyAccountSlots(
        brand.name,
        groupId,
        Math.max(0, brand.empty_slot_count - rows.length),
      ),
    });

    groups.push({
      ...withMetrics,
      dbBrandId: brand.id,
      standardGroupCountByPlatform: {
        ...standardByPlatform,
        ...buildStandardCountByPlatformFromRows(rows),
      },
    });
  }

  const orphanBrandIds = [...accountsByBrand.keys()].filter((id) => !brandById.has(id));
  for (const orphanId of orphanBrandIds) {
    const orphanAccounts = accountsByBrand.get(orphanId) ?? [];
    const name =
      String((orphanAccounts[0]?.metadata as { brand?: string })?.brand ?? 'Unknown').trim() || 'Unknown';
    const groupId = brandIdFromName(name);
    const rows: AccountBrandRow[] = [];
    for (const account of orphanAccounts) {
      const hasSession = activeSessionIds.has(account.id);
      let row = accountRowFromDb(account, name, hasSession, snapshots.get(account.id));
      const master = masterByAccount.get(account.id);
      const { result } = await buildMetricsFromScrapeDaily({
        accountId: account.id,
        brand: name,
        platform: account.platform,
        sessionValid: hasSession,
      });
      const lastActivityAt = lastActivityAtByAccount.get(account.id);
      row = {
        ...row,
        groupsCurrent: result.groupsCurrent,
        groupsTotal: result.groupsTotal,
        adminCurrent: result.adminCurrent,
        adminTotal: result.adminTotal,
        isMisaligned: isMisalignedFromSyncResult(result),
        syncState: lastActivityAt ? 'synced' : row.syncState,
        lastSyncAt: lastActivityAt ?? null,
      };
      if (master) row = applyMasterStatsToAccountRow(row, master);
      rows.push(row);
    }
    groups.push(
      rebuildGroupMetrics({
        ...createEmptyBrandGroup(name),
        id: groupId,
        brandName: name,
        accounts: rows,
        emptySlots: createEmptyAccountSlots(name, groupId, Math.max(0, 3 - rows.length)),
      }),
    );
  }

  return groups.sort((a, b) => a.brandName.localeCompare(b.brandName));
}
