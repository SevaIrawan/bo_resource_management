import { TABLES } from '@/config/tables';
import { normalizePhoneDigits } from '@/lib/phoneNormalize';
import { getSupabase } from '@/lib/supabase';
import type { MessagingAccount } from '@/types/database';

export function readPhoneFromAccount(account: Pick<MessagingAccount, 'phone_number'>): string {
  return (account.phone_number ?? '').trim();
}

/** Alias lama — beberapa modul/cache Vite masih impor nama ini. */
export const readPhoneFromRow = readPhoneFromAccount;

export function hasValidAccountPhone(phone: string): boolean {
  return normalizePhoneDigits(phone).length >= 8;
}

export async function updateMessagingAccountPhone(
  accountId: string,
  phoneNumber: string,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  const phone = phoneNumber.trim();
  if (!hasValidAccountPhone(phone)) {
    throw new Error('PHONE_INVALID');
  }

  const { error } = await supabase
    .from(TABLES.messagingAccounts)
    .update({ phone_number: phone })
    .eq('id', accountId);

  if (error) throw error;
}
