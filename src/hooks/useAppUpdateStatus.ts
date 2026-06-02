import { useEffect, useState } from 'react';

export type AppUpdateUiStatus = 'idle' | 'available' | 'downloaded';

export interface AppUpdateStatus {
  status: AppUpdateUiStatus;
  version?: string;
}

const IDLE: AppUpdateStatus = { status: 'idle' };

export function useAppUpdateStatus(): AppUpdateStatus {
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>(IDLE);

  useEffect(() => {
    const api = window.electronAPI?.app;
    if (!api?.getUpdateStatus) return;

    void api.getUpdateStatus().then(setUpdateStatus).catch(() => setUpdateStatus(IDLE));

    const unsubscribe = api.onUpdateStatus?.((payload) => {
      setUpdateStatus(payload);
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
