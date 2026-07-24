import {
  effectiveAccountOpsRole,
  type AccountOpsRole,
} from '@/config/accountOpsRole';
import { normalizeLocationDeviceOption } from '@/config/locationDeviceOptions';
import { ensureBrand } from '@/lib/brands';
import { markPlatformSessionInvalid } from '@/lib/platformSessions';
import { invalidatePlatformSessionEverywhere } from '@/lib/platformSessionSync';
import { rebuildBrandGroupsMaster } from '@/lib/syncMasterAfterScrape';
import { getSupabase } from '@/lib/supabase';
import { TABLES } from '@/config/tables';
import type { Platform } from '@/types/database';

export interface CreateMessagingAccountInput {
  userId: string;
  platform: Platform;
  label: string;
  phoneNumber?: string;
  locationDevice?: string;
  opsRole: AccountOpsRole;
  brand: string;
  brandId?: string;
}

function buildAccountMetadata(
  brand: string,
  opsRole: AccountOpsRole,
): Record<string, string> {
  return {
    brand: brand.trim(),
    ops_role: effectiveAccountOpsRole(opsRole),
  };
}

function normalizeLocationDevice(value?: string): string | null {
  const normalized = normalizeLocationDeviceOption(value ?? '');
  return normalized || null;
}

function isDuplicateLabelError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { code?: string; message?: string };
  return (
    row.code === '23505' ||
    Boolean(row.message?.includes('rm_messaging_accounts_label_unique'))
  );
}

/** Map error save add-account → kode UI (bukan pesan generik DB). */
export function resolveMessagingAccountSaveErrorCode(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'ACCOUNT_LABEL_IN_USE') return 'ACCOUNT_LABEL_IN_USE';
    if (error.message === 'SUPABASE_NOT_CONFIGURED') return 'SUPABASE_NOT_CONFIGURED';
  }
  if (isDuplicateLabelError(error)) return 'ACCOUNT_LABEL_IN_USE';
  return 'SAVE_FAILED';
}

async function reactivateInactiveMessagingAccount(input: {
  accountId: string;
  brandId: string;
  brandName: string;
  phoneNumber?: string;
  locationDevice?: string;
  opsRole: AccountOpsRole;
}): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  const phone = input.phoneNumber?.trim();

  const { data, error } = await supabase
    .from(TABLES.messagingAccounts)
    .update({
      is_active: true,
      brand_id: input.brandId,
      phone_number: phone || null,
      location_device: normalizeLocationDevice(input.locationDevice),
      metadata: buildAccountMetadata(input.brandName, input.opsRole),
      notes: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.accountId)
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('REACTIVATE_FAILED');

  return data.id as string;
}

export async function createMessagingAccount(
  input: CreateMessagingAccountInput,
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  const brand =
    input.brandId != null
      ? { id: input.brandId }
      : await ensureBrand({ userId: input.userId, brandName: input.brand });

  const label = input.label.trim();
  const phone = input.phoneNumber?.trim();

  const { data: existing, error: findError } = await supabase
    .from(TABLES.messagingAccounts)
    .select('id, is_active')
    .eq('user_id', input.userId)
    .eq('platform', input.platform)
    .eq('label', label)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    if (existing.is_active) {
      throw new Error('ACCOUNT_LABEL_IN_USE');
    }
    return reactivateInactiveMessagingAccount({
      accountId: existing.id as string,
      brandId: brand.id,
      brandName: input.brand,
      phoneNumber: input.phoneNumber,
      locationDevice: input.locationDevice,
      opsRole: input.opsRole,
    });
  }

  const { data, error } = await supabase
    .from(TABLES.messagingAccounts)
    .insert({
      user_id: input.userId,
      brand_id: brand.id,
      platform: input.platform,
      label,
      phone_number: phone || null,
      location_device: normalizeLocationDevice(input.locationDevice),
      metadata: buildAccountMetadata(input.brand, input.opsRole),
    })
    .select('id')
    .single();

  if (error) {
    if (isDuplicateLabelError(error)) {
      throw new Error('ACCOUNT_LABEL_IN_USE');
    }
    throw error;
  }
  if (!data?.id) throw new Error('INSERT_FAILED');

  return data.id as string;
}

async function fetchBrandNameForAccount(accountId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLES.messagingAccounts)
    .select('brand_id, metadata')
    .eq('id', accountId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const metaBrand = String((data.metadata as { brand?: string } | null)?.brand ?? '').trim();
  if (metaBrand) return metaBrand;

  const brandId = data.brand_id as string | undefined;
  if (!brandId) return null;

  const { data: brandRow, error: brandError } = await supabase
    .from(TABLES.brands)
    .select('name')
    .eq('id', brandId)
    .maybeSingle();

  if (brandError) throw brandError;
  const name = String(brandRow?.name ?? '').trim();
  return name || null;
}

/**
 * Lepas akun dari slot: cabut session device (+ purge WA local), hapus akun DB (CASCADE daily),
 * lalu rebuild groups_master dari daily tersisa (kecuali brand_card_removed).
 */
export async function removeMessagingAccountFromSlot(
  accountId: string,
  platform: Platform,
  reason = 'removed_from_slot',
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  const brandName = await fetchBrandNameForAccount(accountId);

  if (window.electronAPI?.isElectron) {
    await invalidatePlatformSessionEverywhere(accountId, reason, platform, {
      purgeWaDisk: platform === 'whatsapp',
    });
  } else {
    await markPlatformSessionInvalid(accountId, reason, platform);
  }

  const { error } = await supabase.from(TABLES.messagingAccounts).delete().eq('id', accountId);

  if (error) throw error;

  if (reason !== 'brand_card_removed' && brandName) {
    await rebuildBrandGroupsMaster({ brand: brandName, platform });
  }
}

export interface UpdateMessagingAccountDetailsInput {
  accountId: string;
  userId: string;
  platform: Platform;
  label: string;
  phoneNumber?: string;
  locationDevice?: string;
  opsRole: AccountOpsRole;
  brandName: string;
}

export async function updateMessagingAccountDetails(
  input: UpdateMessagingAccountDetailsInput,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  const label = input.label.trim();
  const phone = input.phoneNumber?.trim();

  const { data: existing, error: findError } = await supabase
    .from(TABLES.messagingAccounts)
    .select('id')
    .eq('user_id', input.userId)
    .eq('platform', input.platform)
    .eq('label', label)
    .neq('id', input.accountId)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) {
    throw new Error('ACCOUNT_LABEL_IN_USE');
  }

  const { error } = await supabase
    .from(TABLES.messagingAccounts)
    .update({
      label,
      phone_number: phone || null,
      location_device: normalizeLocationDevice(input.locationDevice),
      metadata: buildAccountMetadata(input.brandName, input.opsRole),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.accountId);

  if (error) {
    if (isDuplicateLabelError(error)) {
      throw new Error('ACCOUNT_LABEL_IN_USE');
    }
    throw error;
  }
}

/** Alias — bundle hapus brand & hook remove slot. */
export async function deactivateMessagingAccount(
  accountId: string,
  platform: Platform,
  reason = 'removed_from_slot',
): Promise<void> {
  return removeMessagingAccountFromSlot(accountId, platform, reason);
}
