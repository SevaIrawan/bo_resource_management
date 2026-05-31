/**
 * Tulis platform_sessions dari fakta disk LocalAuth.
 * node scripts/repair-wa-session.mjs NABIL
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const label = (process.argv[2] || 'NABIL').trim();

function loadEnv() {
  const envPath = resolve(root, '.env');
  const text = readFileSync(envPath, 'utf8');
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

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const { data: acc } = await sb
  .from('resource_management_messaging_accounts')
  .select('id, label, platform')
  .ilike('label', label)
  .eq('platform', 'whatsapp')
  .limit(1)
  .maybeSingle();

if (!acc?.id) {
  console.error('Tidak ada akun WA:', label);
  process.exit(1);
}

const sessionData = acc.id;
const { data, error } = await sb.rpc('rm_save_platform_session', {
  p_account_id: acc.id,
  p_session_data: sessionData,
  p_session_type: 'whatsapp_local_auth',
  p_login_method: 'qr',
});

if (error) {
  console.error('GAGAL:', error.message);
  process.exit(1);
}

console.log('OK:', label, 'account_id=', acc.id, 'session_row=', data);
