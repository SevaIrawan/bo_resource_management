/**
 * Diagnosa fakta Supabase — jalankan: node scripts/diagnose-session.mjs [LABEL]
 * Contoh: node scripts/diagnose-session.mjs NABIL
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) {
    console.error('FAKTA: file .env TIDAK ADA di', envPath);
    process.exit(1);
  }
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

const label = (process.argv[2] || 'NABIL').trim();
const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('FAKTA: VITE_SUPABASE_URL atau VITE_SUPABASE_ANON_KEY kosong di .env');
  process.exit(1);
}

console.log('FAKTA: Supabase URL host =', new URL(url).host);
console.log('FAKTA: anon key length =', key.length);

const supabase = createClient(url, key);

const MA = 'resource_management_messaging_accounts';
const PS = 'resource_management_platform_sessions';

async function main() {
  const { data: accounts, error: accErr } = await supabase
    .from(MA)
    .select('id, label, platform, user_id, is_active, phone_number')
    .ilike('label', label);

  if (accErr) {
    console.error('FAKTA: query messaging_accounts ERROR:', accErr.code, accErr.message);
    process.exit(1);
  }

  console.log('\n--- messaging_accounts label ~', label, '---');
  console.log('rows:', accounts?.length ?? 0);
  for (const a of accounts ?? []) {
    console.log(
      `  id=${a.id} platform=${a.platform} user_id=${a.user_id} is_active=${a.is_active} phone=${a.phone_number}`,
    );
  }

  const { data: allActiveSessions, error: psErr } = await supabase
    .from(PS)
    .select('id, account_id, session_type, is_active, session_data, updated_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (psErr) {
    console.error('FAKTA: query platform_sessions ERROR:', psErr.code, psErr.message);
    process.exit(1);
  }

  console.log('\n--- platform_sessions is_active=true (semua) ---');
  console.log('rows:', allActiveSessions?.length ?? 0);

  for (const a of accounts ?? []) {
    const sessions = (allActiveSessions ?? []).filter((s) => s.account_id === a.id);
    console.log(`\n  Akun ${a.label} (${a.platform}) id=${a.id}`);
    console.log('  active sessions for this account_id:', sessions.length);
    for (const s of sessions) {
      const sd = String(s.session_data ?? '').slice(0, 40);
      console.log(`    type=${s.session_type} session_data[0:40]=${sd}`);
    }
  }

  const accountIds = new Set((accounts ?? []).map((a) => a.id));
  const orphan = (allActiveSessions ?? []).filter((s) => !accountIds.has(s.account_id));
  if (orphan.length) {
    console.log('\n--- session aktif TANPA akun label match (orphan) ---');
    for (const s of orphan) {
      console.log(`  account_id=${s.account_id} type=${s.session_type}`);
    }
  }

  console.log('\n--- Simulasi findMessagingAccountWithActiveSession ---');
  for (const platform of ['whatsapp', 'telegram']) {
    const { data: platRows } = await supabase.from(MA).select('id, label').eq('platform', platform);
    const key = label.toLowerCase();
    const matches = (platRows ?? []).filter(
      (r) => String(r.label).trim().toLowerCase() === key,
    );
    let found = null;
    for (const m of matches) {
      const sess = (allActiveSessions ?? []).filter((s) => s.account_id === m.id);
      if (sess.length) {
        found = m.id;
        break;
      }
    }
    console.log(`  platform=${platform} matches=${matches.length} withActiveSession=${found ?? 'NULL'}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
