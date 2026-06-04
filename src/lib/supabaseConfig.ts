import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
let anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
let initDone = false;

function applyConfig(nextUrl: string, nextKey: string) {
  const trimmedUrl = nextUrl.trim();
  const trimmedKey = nextKey.trim();
  if (trimmedUrl === url && trimmedKey === anonKey && client) {
    return;
  }
  url = trimmedUrl;
  anonKey = trimmedKey;
  client =
    url && anonKey
      ? createClient(url, anonKey, {
          auth: { persistSession: true, autoRefreshToken: true },
        })
      : null;
}

/** Dev: .env Vite. Produksi (app terinstall): userData/.env via Electron IPC. */
export async function initSupabaseConfig(): Promise<void> {
  if (initDone) return;
  initDone = true;

  if (window.electronAPI?.app?.getConfig) {
    try {
      const cfg = await window.electronAPI.app.getConfig();
      const key = cfg.supabaseKey?.trim() || cfg.supabaseAnonKey?.trim();
      if (cfg.supabaseUrl && key) {
        applyConfig(cfg.supabaseUrl, key);
        return;
      }
    } catch {
      // fallback ke env build
    }
  }

  applyConfig(url, anonKey);
}

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    applyConfig(url, anonKey);
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabaseConfigDebug(): { url: string; hasKey: boolean } {
  return { url, hasKey: Boolean(anonKey) };
}
