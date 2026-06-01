import { patchAccountSessionInGroups } from '@/lib/accountSessionPatch';
import { resolveLatestSessionUiStatus } from '@/lib/platformSessions';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { SessionUiStatus } from '@/types/accountMonitoringUi';

/**
 * Alur session: device logout → DB (platform_sessions) → UI badge.
 * UI tidak menebak — selalu baca baris session terbaru per akun.
 */
export async function readLatestSessionUiStatus(accountId: string): Promise<SessionUiStatus> {
  return resolveLatestSessionUiStatus(accountId);
}

export function applyLatestSessionStatusToGroups(
  groups: AccountBrandGroup[],
  accountId: string,
  status: SessionUiStatus,
): AccountBrandGroup[] {
  return patchAccountSessionInGroups(groups, accountId, status);
}

export async function refreshAccountSessionInGroups(
  groups: AccountBrandGroup[],
  accountId: string,
): Promise<AccountBrandGroup[]> {
  const status = await readLatestSessionUiStatus(accountId);
  return applyLatestSessionStatusToGroups(groups, accountId, status);
}
