import fs from 'fs';
import path from 'path';
import { app, shell } from 'electron';
import dotenv from 'dotenv';
import { missingOrgEnvKeys, resolveSupabaseApiKey } from '../../src/lib/supabaseEnvKey';

const ENV_FILE_NAME = '.env';

export function getUserDataDir(): string {
  return app.getPath('userData');
}

export function getEnvFilePath(): string {
  return path.join(getUserDataDir(), ENV_FILE_NAME);
}

function envTemplatePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'env-template.env');
  }
  return path.join(process.cwd(), '.env.example');
}

/** Konfigurasi organisasi dibundel saat build — user internal tidak isi manual. */
export function orgDefaultEnvPath(): string | null {
  if (!app.isPackaged) return null;
  const p = path.join(process.resourcesPath, 'org-default.env');
  return fs.existsSync(p) ? p : null;
}

function parseEnvFile(filePath: string): Record<string, string> {
  try {
    return dotenv.parse(fs.readFileSync(filePath));
  } catch {
    return {};
  }
}

function isOrgEnvComplete(parsed: Record<string, string>): boolean {
  return missingOrgEnvKeys(parsed).length === 0;
}

/** Kunci Supabase untuk renderer (service role jika ada). */
export function getSupabaseApiKeyFromProcessEnv(): string {
  return resolveSupabaseApiKey(process.env);
}

function loadEnvFiles(): { primaryPath: string; bundledOrg: boolean } {
  const userPath = getEnvFilePath();
  fs.mkdirSync(getUserDataDir(), { recursive: true });

  const org = orgDefaultEnvPath();
  const devEnv = path.join(process.cwd(), '.env');

  if (app.isPackaged && org && isOrgEnvComplete(parseEnvFile(org))) {
    dotenv.config({ path: org });
    dotenv.config({ path: userPath, override: true });
    // Perbaiki AppData .env kosong dari installer lama — tanpa user buka folder
    if (!isOrgEnvComplete(parseEnvFile(userPath))) {
      fs.copyFileSync(org, userPath);
      dotenv.config({ path: userPath, override: true });
    }
    return { primaryPath: org, bundledOrg: true };
  }

  if (!app.isPackaged && fs.existsSync(devEnv)) {
    dotenv.config({ path: devEnv });
    return { primaryPath: devEnv, bundledOrg: false };
  }

  if (!fs.existsSync(userPath)) {
    const seed = fs.existsSync(envTemplatePath()) ? envTemplatePath() : '';
    if (seed) fs.copyFileSync(seed, userPath);
  }
  dotenv.config({ path: userPath });
  return { primaryPath: userPath, bundledOrg: false };
}

/** Muat env ke process.env (main + sidecar). */
export function loadAppEnv(): string {
  return loadEnvFiles().primaryPath;
}

export function hasBundledOrgConfig(): boolean {
  if (!app.isPackaged) return false;
  const org = orgDefaultEnvPath();
  return Boolean(org && isOrgEnvComplete(parseEnvFile(org)));
}

export type AppConfigStatus = {
  envPath: string;
  configured: boolean;
  missing: string[];
  supabaseUrl: string | null;
  hasTelegramApi: boolean;
  bundledOrgConfig: boolean;
};

export function readAppConfigStatus(): AppConfigStatus {
  const { primaryPath, bundledOrg } = loadEnvFiles();
  const envPath = getEnvFilePath();

  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() || null;
  const telegramId = process.env.TELEGRAM_API_ID?.trim() || null;
  const telegramHash = process.env.TELEGRAM_API_HASH?.trim() || null;

  const missing = missingOrgEnvKeys({
    VITE_SUPABASE_URL: supabaseUrl ?? '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    TELEGRAM_API_ID: telegramId ?? '',
    TELEGRAM_API_HASH: telegramHash ?? '',
  });

  return {
    envPath: bundledOrg ? primaryPath : envPath,
    configured: missing.length === 0,
    missing,
    supabaseUrl,
    hasTelegramApi: Boolean(telegramId && telegramHash),
    bundledOrgConfig: bundledOrg,
  };
}

export function openConfigFolder(): void {
  const dir = getUserDataDir();
  fs.mkdirSync(dir, { recursive: true });
  void shell.openPath(dir);
}
