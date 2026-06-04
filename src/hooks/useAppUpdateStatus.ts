import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/lib/appVersion';

export type AppUpdateUiStatus =
  | 'idle'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface AppUpdateStatus {
  status: AppUpdateUiStatus;
  version?: string;
  percent?: number;
  errorMessage?: string;
  currentVersion: string;
}

function normalizeStatus(
  payload: Partial<AppUpdateStatus> & { status?: AppUpdateUiStatus },
): AppUpdateStatus {
  return {
    status: payload.status ?? 'idle',
    version: payload.version,
    percent: payload.percent,
    errorMessage: payload.errorMessage,
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
  return (
    status === 'available' ||
    status === 'downloading' ||
    status === 'downloaded' ||
    status === 'error'
  );
}
