import type { AppUpdateUiStatus } from '@/hooks/useAppUpdateStatus';

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

export function hasNewerAppVersion(status: AppUpdateUiStatus): boolean {
  return status === 'available' || status === 'downloaded';
}

export function appUpdateStatusLine(
  t: TranslateFn,
  status: AppUpdateUiStatus,
  availableVersion?: string,
): string | null {
  if (!hasNewerAppVersion(status) || !availableVersion) return null;
  if (status === 'downloaded') {
    return t('appUpdate.readyToInstall', { version: availableVersion });
  }
  return t('appUpdate.downloading', { version: availableVersion });
}
