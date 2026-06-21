import { contextBridge, ipcRenderer } from 'electron';

type Platform = 'whatsapp' | 'telegram';
type LoginMode = 'qr' | 'phone';
type LoginPhase = 'pending' | 'need_code' | 'need_2fa' | 'confirming';

interface PlatformLoginEvent {
  sessionId: string;
  platform: Platform;
  dataUrl?: string;
  generation?: number;
  code?: string;
  message?: string;
  phase?: LoginPhase;
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  app: {
    getConfig: () => ipcRenderer.invoke('app:get-config'),
    getConfigStatus: () => ipcRenderer.invoke('app:get-config-status'),
    openConfigFolder: () => ipcRenderer.invoke('app:open-config-folder'),
    checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
    installUpdate: () =>
      ipcRenderer.invoke('app:install-update') as Promise<{ ok: boolean; message?: string }>,
    getUpdateStatus: () =>
      ipcRenderer.invoke('app:get-update-status') as Promise<{
        status: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';
        version?: string;
        percent?: number;
        errorMessage?: string;
        currentVersion?: string;
      }>,
    onUpdateStatus: (
      callback: (payload: {
        status: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';
        version?: string;
        percent?: number;
        errorMessage?: string;
        currentVersion?: string;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: {
          status: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';
          version?: string;
          percent?: number;
          errorMessage?: string;
          currentVersion?: string;
        },
      ) => {
        callback(payload);
      };
      ipcRenderer.on('app:update-status', listener);
      return () => ipcRenderer.removeListener('app:update-status', listener);
    },
  },
  platformLogin: {
    start: (payload: {
      sessionId: string;
      platform: Platform;
      mode?: LoginMode;
      phone?: string;
      skipDiskRestore?: boolean;
      groupEstimate?: number;
      alreadyPrepared?: boolean;
    }) => ipcRenderer.invoke('platform-login:start', payload),
    submit: (payload: {
      sessionId: string;
      platform: Platform;
      kind: 'code' | '2fa' | 'phone';
      value: string;
    }) => ipcRenderer.invoke('platform-login:submit', payload),
    cancel: (sessionId: string, platform?: Platform) =>
      ipcRenderer.invoke('platform-login:cancel', sessionId, platform),
    release: (
      sessionId: string,
      options?: {
        purgeWaDisk?: boolean;
        groupEstimate?: number;
        fast?: boolean;
        urgent?: boolean;
      },
    ) => ipcRenderer.invoke('platform-login:release', sessionId, options),
    purgeWaAuth: (sessionId: string) =>
      ipcRenderer.invoke('platform-login:purge-wa-auth', sessionId),
    tryRestore: (payload: {
      sessionId: string;
      platform: Platform;
      storedSessionString?: string | null;
    }) => ipcRenderer.invoke('platform-login:try-restore', payload),
    hasWaDiskAuth: (sessionId: string) =>
      ipcRenderer.invoke('platform-login:has-wa-disk-auth', sessionId) as Promise<{
        hasAuth: boolean;
      }>,
    onQr: (callback: (payload: PlatformLoginEvent & { dataUrl: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: PlatformLoginEvent) => {
        if (payload.dataUrl) callback(payload as PlatformLoginEvent & { dataUrl: string });
      };
      ipcRenderer.on('platform-login:qr', listener);
      return () => ipcRenderer.removeListener('platform-login:qr', listener);
    },
    onPairingCode: (callback: (payload: PlatformLoginEvent & { code: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: PlatformLoginEvent) => {
        if (payload.code) callback(payload as PlatformLoginEvent & { code: string });
      };
      ipcRenderer.on('platform-login:pairing-code', listener);
      return () => ipcRenderer.removeListener('platform-login:pairing-code', listener);
    },
    onPhase: (callback: (payload: PlatformLoginEvent & { phase: LoginPhase }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: PlatformLoginEvent) => {
        if (payload.phase) callback(payload as PlatformLoginEvent & { phase: LoginPhase });
      };
      ipcRenderer.on('platform-login:phase', listener);
      return () => ipcRenderer.removeListener('platform-login:phase', listener);
    },
    onReady: (callback: (payload: PlatformLoginEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: PlatformLoginEvent) => {
        callback(payload);
      };
      ipcRenderer.on('platform-login:ready', listener);
      return () => ipcRenderer.removeListener('platform-login:ready', listener);
    },
    onError: (callback: (payload: PlatformLoginEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: PlatformLoginEvent) => {
        callback(payload);
      };
      ipcRenderer.on('platform-login:error', listener);
      return () => ipcRenderer.removeListener('platform-login:error', listener);
    },
  },
  scraper: {
    run: (payload: {
      sessionId: string;
      platform: Platform;
      storedSessionString?: string | null;
      expectedPhone?: string;
    }) => ipcRenderer.invoke('scraper:run', payload),
    cancel: (payload: { sessionId: string; platform: Platform }) =>
      ipcRenderer.invoke('scraper:cancel', payload),
    cancelCount: (payload: { sessionId: string; platform: Platform }) =>
      ipcRenderer.invoke('scraper:cancel-count', payload),
    countGroups: (payload: {
      sessionId: string;
      platform: Platform;
      storedSessionString?: string | null;
      quick?: boolean;
      reuseLiveLogin?: boolean;
    }) => ipcRenderer.invoke('scraper:count-groups', payload),
    validateSession: (payload: {
      sessionId: string;
      platform: Platform;
      storedSessionString?: string | null;
    }) => ipcRenderer.invoke('scraper:validate-session', payload),
    exportTelegramSession: (sessionId: string) =>
      ipcRenderer.invoke('scraper:export-telegram-session', sessionId),
    onProgress: (
      callback: (payload: {
        sessionId: string;
        phase: string;
        current?: number;
        total?: number;
        label?: string;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: {
          sessionId: string;
          phase: string;
          current?: number;
          total?: number;
          label?: string;
        },
      ) => {
        callback(payload);
      };
      ipcRenderer.on('scraper:progress', listener);
      return () => ipcRenderer.removeListener('scraper:progress', listener);
    },
  },
  automation: {
    run: (payload: {
      sessionId: string;
      platform: Platform;
      action: 'create_group' | 'set_admin' | 'join_by_invite_link';
      storedSessionString?: string | null;
      expectedPhone?: string;
      delay?: {
        between_targets_sec?: number;
        after_create_sec?: number;
        flood_wait_extra_sec?: number;
        max_floodwait_auto_sleep_sec?: number;
        invite_export_retries?: number;
        invite_export_retry_sec?: number;
        jitter_percent?: number;
      };
      groupName?: string;
      description?: string;
      hideChatHistory?: boolean;
      initialParticipants?: string[];
      groupId?: string;
      groupLink?: string;
      targets?: string[];
      adminRights?: Record<string, boolean>;
      inviteLink?: string;
    }) => ipcRenderer.invoke('automation:run', payload),
  },
  jobQueue: {
    getSnapshot: (filter?: { brandName?: string; platform?: Platform }) =>
      ipcRenderer.invoke('jobQueue:getSnapshot', filter),
    enqueue: (input: {
      brandName: string;
      platform: Platform;
      accountId: string;
      accountName: string;
      sessionId: string;
      action: 'create_group' | 'set_admin' | 'join_by_invite_link';
      payload: Record<string, unknown>;
      storedSessionString?: string | null;
      expectedPhone?: string;
      delay?: Record<string, number | undefined>;
    }) => ipcRenderer.invoke('jobQueue:enqueue', input),
    cancel: (jobId: string) => ipcRenderer.invoke('jobQueue:cancel', jobId),
    run: (jobId: string) => ipcRenderer.invoke('jobQueue:run', jobId),
    pauseJob: (jobId: string) => ipcRenderer.invoke('jobQueue:pauseJob', jobId),
    removeJobs: (jobIds: string[]) => ipcRenderer.invoke('jobQueue:removeJobs', jobIds),
    clearCompleted: (filter?: { brandName?: string; platform?: Platform }) =>
      ipcRenderer.invoke('jobQueue:clearCompleted', filter),
    setPaused: (paused: boolean) => ipcRenderer.invoke('jobQueue:setPaused', paused),
    onChanged: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('jobQueue:changed', listener);
      return () => ipcRenderer.removeListener('jobQueue:changed', listener);
    },
  },
  onSessionInvalid: (
    callback: (payload: { sessionId: string; platform: Platform; message?: string }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string; platform: Platform; message?: string },
    ) => {
      callback(payload);
    };
    ipcRenderer.on('platform-session:invalid', listener);
    return () => ipcRenderer.removeListener('platform-session:invalid', listener);
  },
});
