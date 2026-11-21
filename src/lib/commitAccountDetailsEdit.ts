import type { EditAccountFormValues } from '@/components/group-monitoring/EditAccountModal';
import { effectiveAccountOpsRole, normalizeAccountOpsRole } from '@/config/accountOpsRole';
import { normalizeLocationDeviceOption } from '@/config/locationDeviceOptions';
import { effectiveWaBatch, normalizeWaBatch } from '@/config/waBatch';
import { updateMessagingAccountDetails } from '@/lib/messagingAccounts';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

export function normalizeEditAccountFormValues(
  values: EditAccountFormValues,
): EditAccountFormValues {
  const opsRole = normalizeAccountOpsRole(values.opsRole);
  if (!opsRole) {
    throw new Error('OPS_ROLE_REQUIRED');
  }
  return {
    accountName: values.accountName.trim(),
    phoneNumber: values.phoneNumber.trim(),
    locationDevice: normalizeLocationDeviceOption(values.locationDevice),
    opsRole,
    waBatch: normalizeWaBatch(values.waBatch),
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

  const isWa = input.account.platform === 'whatsapp';
  const waBatchChanged = isWa && normalized.waBatch !== effectiveWaBatch(input.account.waBatch);

  await updateMessagingAccountDetails({
    accountId: input.account.id,
    userId: input.userId,
    platform: input.account.platform,
    label: normalized.accountName,
    phoneNumber: normalized.phoneNumber,
    locationDevice: normalized.locationDevice || undefined,
    opsRole: effectiveAccountOpsRole(normalized.opsRole),
    brandName: input.brandName,
    // WA: tulis hanya bila batch benar-benar diganti (NULL tampil OLD tidak diubah jadi 'OLD').
    // Telegram: diabaikan service.
    waBatch: waBatchChanged ? normalized.waBatch : undefined,
  });

  // Patch grid lokal = nilai yang benar-benar ada di DB.
  return {
    ...normalized,
    waBatch: waBatchChanged ? normalized.waBatch : normalizeWaBatch(input.account.waBatch),
  };
}
