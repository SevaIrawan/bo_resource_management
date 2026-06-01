import { applySyncResultToGroup, rebuildGroupMetrics } from '@/lib/accountBrandUtils';
import { patchAccountSessionInGroups } from '@/lib/accountSessionPatch';
import { invalidSessionMetricsFromDaily } from '@/lib/accountSessionUi';
import { resolveDbAccountForRow } from '@/lib/accountSessionResolve';
import { invalidateUserSessionOnDeviceFailure } from '@/lib/userActionSession';
import { probePlatformSession } from '@/lib/sessionProbe';
import { isDeviceSessionDeadMessage, isDeviceBusyMessage } from '@/lib/scrapeErrorUi';
import { hasValidAccountPhone } from '@/lib/accountPhone';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

/** Hanya untuk refresh opsional di background — jangan dipakai blocking load halaman. */
const PROBE_TIMEOUT_MS = 25_000;

function withProbeTimeout<T>(promise: Promise<T>): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), PROBE_TIMEOUT_MS);
    }),
  ]);
}

/**
 * Setelah load dari DB: cek tautan WA/TG di device (strict).
 * UNPAIRED / logout di HP → invalidasi DB + baris UI logout/invalid.
 */
export async function refreshSessionsFromDeviceProbe(
  userId: string,
  groups: AccountBrandGroup[],
): Promise<AccountBrandGroup[]> {
  if (!window.electronAPI?.isElectron) return groups;

  let next = groups;

  for (const group of groups) {
    for (const account of group.accounts) {
      if (!hasValidAccountPhone(account.phoneNumber)) continue;

      let dbAccountId = account.id;
      try {
        const resolved = await resolveDbAccountForRow({ userId, account });
        dbAccountId = resolved.accountId;
      } catch {
        continue;
      }

      const probe = await withProbeTimeout(
        probePlatformSession({
          sessionId: account.id,
          platform: account.platform,
          accountId: dbAccountId,
          strict: true,
        }),
      );

      if (probe?.valid) {
        next = patchAccountSessionInGroups(next, account.id, 'valid');
        continue;
      }

      const msg = probe?.message ?? 'device_probe_failed';

      if (isDeviceSessionDeadMessage(msg)) {
        await invalidateUserSessionOnDeviceFailure({
          dbAccountId,
          platform: account.platform,
          message: msg,
          shouldInvalidate: true,
        });
        const brandX = account.groupsTotal > 0 ? account.groupsTotal : 0;
        const invalidResult = await invalidSessionMetricsFromDaily({
          accountId: dbAccountId,
          brand: account.brandName,
          platform: account.platform,
          brandStandard: brandX,
        });
        next = next.map((g) =>
          g.id === group.id ? applySyncResultToGroup(g, account.id, invalidResult) : g,
        );
        next = next.map((g) => (g.id === group.id ? rebuildGroupMetrics(g) : g));
        continue;
      }

      if (isDeviceBusyMessage(msg) || probe === null) {
        continue;
      }
    }
  }

  return next;
}
