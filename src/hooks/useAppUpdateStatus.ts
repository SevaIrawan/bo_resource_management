import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/lib/appVersion';

export type AppUpdateUiStatus = 'idle' | 'available' | 'downloaded';

export interface AppUpdateStatus {
  status: AppUpdateUiStatus;
  /** Versi pembaruan di GitHub (jika ada). */
  version?: string;
  /** Versi terpasang di PC ini. */
  currentVersion: string;
}

function normalizeStatus(
  payload: Partial<AppUpdateStatus> & { status?: AppUpdateUiStatus },
): AppUpdateStatus {
  return {
    status: payload.status ?? 'idle',
    version: payload.version,
    currentVersion: payload.currentVersion?.trim() || APP_VERSION,
  };
}

const IDLE: AppUpdateStatus = normalizeStatus({ status: 'idle' });

export function useAppUpdateStatus(): AppUpdateStatus {
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>(IDLE);

  useEffect(() => {
    const api = window.electronAPI?.app;
    if (!api?.getUpdateStatus) return;

    void api
      .getUpdateStatus()
      .then((payload) => setUpdateStatus(normalizeStatus(payload)))
      .catch(() => setUpdateStatus(IDLE));

    const unsubscribe = api.onUpdateStatus?.((payload) => {
      setUpdateStatus(normalizeStatus(payload));
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  return updateStatus;
}

export function hasAppUpdateNotice(status: AppUpdateUiStatus): boolean {
  return status === 'available' || status === 'downloaded';
}
