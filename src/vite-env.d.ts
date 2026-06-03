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
          status: 'idle' | 'available' | 'downloaded';
          version?: string;
          currentVersion?: string;
        }>;
        onUpdateStatus: (
          callback: (payload: {
            status: 'idle' | 'available' | 'downloaded';
            version?: string;
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
          options?: { purgeWaDisk?: boolean },
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
          storedSessionString?: string | null;
        }) => Promise<{ ok: boolean; groups: ScrapedGroupRow[]; count: number }>;
        countGroups: (payload: {
          sessionId: string;
          platform: Platform;
          storedSessionString?: string | null;
          quick?: boolean;
        }) => Promise<{
          valid: boolean;
          totalGroups: number;
          adminGroups: number;
          message?: string;
        }>;
    validateSession: (payload: {
      sessionId: string;
      platform: Platform;
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
