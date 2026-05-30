import { getSupabase } from '@/lib/supabase';
import { TABLES } from '@/config/tables';
import type { Platform } from '@/types/database';

export interface CreateMessagingAccountInput {
  userId: string;
  platform: Platform;
  label: string;
  phoneOrUsername?: string;
  brand: string;
}

export async function createMessagingAccount(
  input: CreateMessagingAccountInput,
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  const phone = input.phoneOrUsername?.trim();

  const { data, error } = await supabase
    .from(TABLES.messagingAccounts)
    .insert({
      user_id: input.userId,
      platform: input.platform,
      label: input.label.trim(),
      phone_or_username: phone || null,
      metadata: { brand: input.brand },
    })
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('INSERT_FAILED');

  return data.id as string;
}
