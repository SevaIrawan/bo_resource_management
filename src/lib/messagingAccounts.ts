import { ensureBrand } from '@/lib/brands';
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
