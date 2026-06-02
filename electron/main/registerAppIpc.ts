import { ipcMain } from 'electron';
import { checkForUpdatesNow, getAppUpdateStatus } from './autoUpdate';
import {
  getSupabaseApiKeyFromProcessEnv,
  loadAppEnv,
  openConfigFolder,
  readAppConfigStatus,
} from './appEnv';

export function registerAppIpc() {
  ipcMain.handle('app:get-config', () => {
    loadAppEnv();
    const status = readAppConfigStatus();
    const supabaseKey = getSupabaseApiKeyFromProcessEnv();
    return {
      supabaseUrl: process.env.VITE_SUPABASE_URL?.trim() ?? '',
      supabaseKey,
      /** @deprecated gunakan supabaseKey (service role diutamakan) */
      supabaseAnonKey: supabaseKey,
      hasTelegramApi: status.hasTelegramApi,
      envPath: status.envPath,
      configured: status.configured,
      missing: status.missing,
    };
  });

  ipcMain.handle('app:get-config-status', () => readAppConfigStatus());

  ipcMain.handle('app:open-config-folder', () => {
    openConfigFolder();
    return { ok: true };
  });

  ipcMain.handle('app:check-for-updates', () => checkForUpdatesNow());

  ipcMain.handle('app:get-update-status', () => getAppUpdateStatus());
}
