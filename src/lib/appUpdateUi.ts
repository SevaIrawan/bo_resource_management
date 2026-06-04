import type { AppUpdateUiStatus } from '@/hooks/useAppUpdateStatus';

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

export function hasNewerAppVersion(status: AppUpdateUiStatus): boolean {
  return (
    status === 'available' ||
    status === 'downloading' ||
    status === 'downloaded' ||
    status === 'error'
  );
}

export function appUpdateStatusLine(
  t: TranslateFn,
  status: AppUpdateUiStatus,
  availableVersion?: string,
  percent?: number,
  errorMessage?: string,
): string | null {
  if (status === 'error') {
    return errorMessage?.trim()
      ? t('appUpdate.failedDetail', { message: errorMessage })
      : t('appUpdate.failed');
  }
  if (!hasNewerAppVersion(status) || !availableVersion) return null;
  if (status === 'downloaded') {
    return t('appUpdate.readyToInstall', { version: availableVersion });
  }
  if (status === 'available') {
    return t('appUpdate.updateAvailable', { version: availableVersion });
  }
  if (status === 'downloading') {
    const pct = percent != null && percent >= 0 ? Math.min(100, Math.round(percent)) : null;
    return pct != null
      ? t('appUpdate.downloadingPercent', { version: availableVersion, percent: pct })
      : t('appUpdate.downloading', { version: availableVersion });
  }
  return t('appUpdate.updateAvailable', { version: availableVersion });
}
