import type { EditAccountFormValues } from '@/components/group-monitoring/EditAccountModal';
import { normalizeLocationDeviceOption } from '@/config/locationDeviceOptions';
import { updateMessagingAccountDetails } from '@/lib/messagingAccounts';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

export function normalizeEditAccountFormValues(
  values: EditAccountFormValues,
): EditAccountFormValues {
  return {
    accountName: values.accountName.trim(),
    phoneNumber: values.phoneNumber.trim(),
    locationDevice: normalizeLocationDeviceOption(values.locationDevice),
  };
}

/** Simpan edit akun: DB dulu, return nilai normalisasi untuk patch grid lokal. */
export async function commitAccountDetailsEdit(input: {
  userId: string | null | undefined;
  brandName: string;
  account: AccountBrandRow;
  values: EditAccountFormValues;
}): Promise<EditAccountFormValues> {
  const normalized = normalizeEditAccountFormValues(input.values);

  if (!input.userId) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  await updateMessagingAccountDetails({
    accountId: input.account.id,
    userId: input.userId,
    platform: input.account.platform,
    label: normalized.accountName,
    phoneNumber: normalized.phoneNumber,
    locationDevice: normalized.locationDevice || undefined,
    brandName: input.brandName,
  });

  return normalized;
}
