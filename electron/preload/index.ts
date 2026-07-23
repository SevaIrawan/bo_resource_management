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
      accountId?: string;
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
      accountId?: string;
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
      accountId?: string;
      storedSessionString?: string | null;
      expectedPhone?: string;
    }) => ipcRenderer.invoke('scraper:run', payload),
    runAuto: (payload: {
      sessionId: string;
      platform: Platform;
      accountId?: string;
      storedSessionString?: string | null;
      expectedPhone?: string;
    }) => ipcRenderer.invoke('scraper:run-auto', payload),
    cancel: (payload: { sessionId: string; platform: Platform }) =>
      ipcRenderer.invoke('scraper:cancel', payload),
    cancelAuto: (payload: { sessionId: string; platform: Platform }) =>
      ipcRenderer.invoke('scraper:cancel-auto', payload),
    autoLaneReady: (payload: { sessionId: string; accountId: string }) =>
      ipcRenderer.invoke('scraper:auto-lane-ready', payload),
    validateSession: (payload: {
      sessionId: string;
      platform: Platform;
      storedSessionString?: string | null;
      strict?: boolean;
      accountId?: string;
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
  jobQueue: {
    getSnapshot: (filter?: { brandName?: string; platform?: Platform }) =>
      ipcRenderer.invoke('jobQueue:getSnapshot', filter),
    enqueue: (input: {
      brandName: string;
      platform: Platform;
      accountId: string;
      accountName: string;
      sessionId: string;
      action: 'create_group' | 'set_group_photo' | 'set_admin' | 'join_by_invite_link' | 'leave_group' | 'delete_group' | 'exit_delete_group';
      payload: Record<string, unknown>;
      storedSessionString?: string | null;
      expectedPhone?: string;
      delay?: Record<string, number | undefined>;
    }) => ipcRenderer.invoke('jobQueue:enqueue', input),
    cancel: (jobId: string) => ipcRenderer.invoke('jobQueue:cancel', jobId),
    run: (jobId: string) => ipcRenderer.invoke('jobQueue:run', jobId),
    pauseJob: (jobId: string) => ipcRenderer.invoke('jobQueue:pauseJob', jobId),
    removeJobs: (jobIds: string[]) => ipcRenderer.invoke('jobQueue:removeJobs', jobIds),
    onChanged: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('jobQueue:changed', listener);
      return () => ipcRenderer.removeListener('jobQueue:changed', listener);
    },
  },
  brandGroupPhoto: {
    resolve: (brandName: string) =>
      ipcRenderer.invoke('brandGroupPhoto:resolve', brandName) as Promise<{
        ok: boolean;
        path?: string;
        expectedFileName?: string;
        dir?: string;
      }>,
    pickAndSave: (brandName: string) =>
      ipcRenderer.invoke('brandGroupPhoto:pickAndSave', brandName) as Promise<{
        ok: boolean;
        path?: string;
        dataUrl?: string;
        error?: string;
      }>,
    previewUrl: (filePath: string) =>
      ipcRenderer.invoke('brandGroupPhoto:previewUrl', filePath) as Promise<{
        ok: boolean;
        dataUrl?: string;
      }>,
    list: (brandName: string) =>
      ipcRenderer.invoke('brandGroupPhoto:list', brandName) as Promise<{
        ok: boolean;
        photos?: Array<{ path: string; fileName: string; savedAt: string }>;
      }>,
    saveBlob: (brandName: string, base64Data: string) =>
      ipcRenderer.invoke('brandGroupPhoto:saveBlob', brandName, base64Data) as Promise<{
        ok: boolean;
        path?: string;
      }>,
  },
  executeSlots: {
    tryAcquire: (
      accountId: string,
      kind: 'sync' | 'scraper',
      platform: Platform,
    ) => ipcRenderer.invoke('executeSlots:tryAcquire', accountId, kind, platform),
    release: (accountId: string) => ipcRenderer.invoke('executeSlots:release', accountId),
    acquireOrWait: (
      accountId: string,
      kind: 'sync' | 'scraper',
      platform: Platform,
    ) => ipcRenderer.invoke('executeSlots:acquireOrWait', accountId, kind, platform),
    getStats: () => ipcRenderer.invoke('executeSlots:getStats'),
    onChanged: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('executeSlots:changed', listener);
      return () => ipcRenderer.removeListener('executeSlots:changed', listener);
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
