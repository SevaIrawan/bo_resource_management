import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(__dirname, '../..');

function parseEnvText(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

/** .env proyek → AppData Electron → env vars proses. */
export function loadProjectEnv() {
  const candidates = [
    join(projectRoot, '.env'),
    join(
      process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
      'resource-management',
      '.env',
    ),
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      return { env: parseEnvText(readFileSync(p, 'utf8')), path: p };
    }
  }

  const fromProcess = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (fromProcess.VITE_SUPABASE_URL && fromProcess.VITE_SUPABASE_ANON_KEY) {
    return { env: fromProcess, path: '(process env)' };
  }

  return { env: {}, path: null };
}
