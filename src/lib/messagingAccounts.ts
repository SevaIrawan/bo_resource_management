import { ensureBrand } from '@/lib/brands';
import { markPlatformSessionInvalid } from '@/lib/platformSessions';
import { invalidatePlatformSessionEverywhere } from '@/lib/platformSessionSync';
import { getSupabase } from '@/lib/supabase';
import { TABLES } from '@/config/tables';
import type { Platform } from '@/types/database';

export interface CreateMessagingAccountInput {
  userId: string;
  platform: Platform;
  label: string;
  phoneNumber?: string;
  brand: string;
  brandId?: string;
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

  const phone = input.phoneNumber?.trim();

  const { data, error } = await supabase
    .from(TABLES.messagingAccounts)
    .insert({
      user_id: input.userId,
      brand_id: brand.id,
      platform: input.platform,
      label: input.label.trim(),
      phone_number: phone || null,
      metadata: { brand: input.brand.trim() },
    })
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('INSERT_FAILED');

  return data.id as string;
}

/**
 * Lepas akun dari slot card: nonaktifkan di DB, cabut session device, kosongkan slot UI.
 */
export async function deactivateMessagingAccount(
  accountId: string,
  platform: Platform,
  reason = 'removed_from_slot',
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  if (window.electronAPI?.isElectron) {
    await invalidatePlatformSessionEverywhere(accountId, reason, platform, {
      purgeWaDisk: platform === 'whatsapp',
    });
  } else {
    await markPlatformSessionInvalid(accountId, reason, platform);
  }

  const { error } = await supabase
    .from(TABLES.messagingAccounts)
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
      notes: reason,
    })
    .eq('id', accountId);

  if (error) throw error;
}
