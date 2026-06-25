/// <reference types="vite/client" />

export {};

type Platform = 'whatsapp' | 'telegram';
type LoginMode = 'qr' | 'phone';
type LoginPhase = 'pending' | 'need_code' | 'need_2fa' | 'confirming' | 'loading';

/** Output scraper WA/TG — selaras kolom group_scrape_daily / groups_master. */
interface ScrapedGroupRow {
  group_id: string;
  group_name: string;
  invite_link: string | null;
  is_admin: 'yes' | 'no';
  member_count: number;
  admin_count: number;
  owner_count: number;
}

interface PlatformLoginEvent {
  sessionId: string;
  platform: Platform;
  dataUrl?: string;
  generation?: number;
  code?: string;
  message?: string;
  phase?: LoginPhase;
}

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      isElectron: boolean;
      app?: {
        getConfig: () => Promise<{
          supabaseUrl: string;
          /** Service role jika ada di .env bawaan IT; fallback anon (dev). */
          supabaseKey: string;
          supabaseAnonKey: string;
          hasTelegramApi: boolean;
          envPath: string;
          configured: boolean;
          missing: string[];
        }>;
        getConfigStatus: () => Promise<{
          envPath: string;
          configured: boolean;
          missing: string[];
          supabaseUrl: string | null;
          hasTelegramApi: boolean;
          bundledOrgConfig: boolean;
        }>;
        openConfigFolder: () => Promise<{ ok: boolean }>;
        checkForUpdates: () => Promise<{
          status: 'dev' | 'checking' | 'error';
          message?: string;
        }>;
        installUpdate?: () => Promise<{ ok: boolean; message?: string }>;
        getUpdateStatus: () => Promise<{
          status: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';
          version?: string;
          percent?: number;
          errorMessage?: string;
          currentVersion?: string;
        }>;
        onUpdateStatus: (
          callback: (payload: {
            status: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';
            version?: string;
            percent?: number;
            errorMessage?: string;
            currentVersion?: string;
          }) => void,
        ) => () => void;
      };
      platformLogin?: {
        start: (payload: {
          sessionId: string;
          platform: Platform;
          mode?: LoginMode;
          phone?: string;
          skipDiskRestore?: boolean;
          groupEstimate?: number;
          alreadyPrepared?: boolean;
        }) => Promise<{ ok: boolean }>;
        submit: (payload: {
          sessionId: string;
          platform: Platform;
          kind: 'code' | '2fa' | 'phone';
          value: string;
        }) => Promise<{ ok: boolean }>;
        cancel: (sessionId: string, platform?: Platform) => Promise<{ ok: boolean }>;
        release: (
          sessionId: string,
          options?: {
            purgeWaDisk?: boolean;
            groupEstimate?: number;
            fast?: boolean;
            urgent?: boolean;
          },
        ) => Promise<{ ok: boolean }>;
        purgeWaAuth?: (sessionId: string) => Promise<{ ok: boolean }>;
        tryRestore?: (payload: {
          sessionId: string;
          platform: Platform;
          storedSessionString?: string | null;
        }) => Promise<{ ready: boolean; message?: string }>;
        hasWaDiskAuth?: (sessionId: string) => Promise<{ hasAuth: boolean }>;
        onQr: (callback: (payload: PlatformLoginEvent & { dataUrl: string }) => void) => () => void;
        onPairingCode: (
          callback: (payload: PlatformLoginEvent & { code: string }) => void,
        ) => () => void;
        onPhase: (
          callback: (payload: PlatformLoginEvent & { phase: LoginPhase }) => void,
        ) => () => void;
        onReady: (callback: (payload: PlatformLoginEvent) => void) => () => void;
        onError: (callback: (payload: PlatformLoginEvent) => void) => () => void;
      };
      scraper?: {
        run: (payload: {
          sessionId: string;
          platform: Platform;
          accountId?: string;
          storedSessionString?: string | null;
          expectedPhone?: string;
        }) => Promise<{
          ok: boolean;
          groups: ScrapedGroupRow[];
          count: number;
          loggedInAs?: string;
          elapsedMs?: number;
        }>;
        cancel: (payload: {
          sessionId: string;
          platform: Platform;
        }) => Promise<{ ok: boolean }>;
        cancelCount: (payload: {
          sessionId: string;
          platform: Platform;
        }) => Promise<{ ok: boolean }>;
        countGroups: (payload: {
          sessionId: string;
          platform: Platform;
          accountId?: string;
          storedSessionString?: string | null;
          quick?: boolean;
          reuseLiveLogin?: boolean;
        }) => Promise<{
          valid: boolean;
          totalGroups: number;
          adminGroups: number;
          message?: string;
        }>;
    validateSession: (payload: {
      sessionId: string;
      platform: Platform;
      accountId?: string;
      storedSessionString?: string | null;
      strict?: boolean;
    }) => Promise<{ valid: boolean; message?: string }>;
        exportTelegramSession: (
          sessionId: string,
        ) => Promise<{ sessionString: string; loginMethod?: string }>;
        onProgress?: (
          callback: (payload: {
            sessionId: string;
            phase: string;
            current?: number;
            total?: number;
            label?: string;
          }) => void,
        ) => () => void;
      };
      automation?: {
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
        }) => Promise<{
          status: 'ok' | 'error';
          action: 'create_group' | 'set_admin' | 'join_by_invite_link';
          message?: string;
          errorCode?: string;
          result?: Record<string, unknown>;
        }>;
      };
      jobQueue?: {
        getSnapshot: (filter?: {
          brandName?: string;
          platform?: Platform;
        }) => Promise<{
          jobs: Array<{
            id: string;
            brandName: string;
            platform: Platform;
            accountId: string;
            accountName: string;
            sessionId: string;
            action: 'create_group' | 'set_admin' | 'join_by_invite_link';
            status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
            createdAt: string;
            startedAt?: string;
            finishedAt?: string;
            error?: string;
            message?: string;
            paused?: boolean;
            progress?: { current: number; total: number; label?: string };
            payload: Record<string, unknown>;
          }>;
          runnerState: 'idle' | 'running' | 'paused';
          runningJobId: string | null;
          runningJobIds: string[];
          maxConcurrent: number;
          runningCount: number;
          queuedCount: number;
          blockingExecutes: boolean;
          busyAccountIds: string[];
          settlingSessionIds: string[];
          globalScrapeActive: boolean;
          executeSlotsActive: number;
          executeSlotsMax: number;
          executeSlotsQueued: number;
        }>;
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
        }) => Promise<
          | { ok: true; job: { id: string } }
          | { ok: false; error?: string }
        >;
        cancel: (jobId: string) => Promise<{ ok: boolean }>;
        run: (jobId: string) => Promise<{ ok: boolean }>;
        pauseJob: (jobId: string) => Promise<{ ok: boolean }>;
        removeJobs: (jobIds: string[]) => Promise<{ ok: boolean; removed?: number }>;
        clearCompleted: (filter?: {
          brandName?: string;
          platform?: Platform;
        }) => Promise<{ ok: boolean; removed?: number }>;
        setPaused: (paused: boolean) => Promise<{
          ok: boolean;
          runnerState?: 'idle' | 'running' | 'paused';
        }>;
        onChanged: (callback: () => void) => () => void;
      };
      executeSlots?: {
        tryAcquire: (
          accountId: string,
          kind: 'sync' | 'scraper',
        ) => Promise<{ ok: true } | { ok: false; reason: 'same_account' | 'slots_full' }>;
        release: (accountId: string) => Promise<{ ok: boolean }>;
        acquireOrWait: (
          accountId: string,
          kind: 'sync' | 'scraper',
        ) => Promise<
          | { ok: true; queued: boolean }
          | { ok: false; reason: 'same_account' }
        >;
        getStats: () => Promise<{
          maxConcurrent: number;
          activeCount: number;
          queuedCount: number;
          activeAccountIds: string[];
        }>;
        onChanged: (callback: () => void) => () => void;
      };
      onSessionInvalid?: (
        callback: (payload: {
          sessionId: string;
          platform: Platform;
          message?: string;
        }) => void,
      ) => () => void;
    };
  }
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.avif' {
  const src: string;
  export default src;
}

declare module '*.ico' {
  const src: string;
  export default src;
}

declare module '*.bmp' {
  const src: string;
  export default src;
}

declare module '*?url' {
  const src: string;
  export default src;
}
