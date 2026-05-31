/**
 * Audit fakta: akun vs session vs daily scrape (bukan tebakan).
 * node scripts/audit-all-accounts.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const text = readFileSync(resolve(root, '.env'), 'utf8');
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
const MA = 'resource_management_messaging_accounts';
const PS = 'resource_management_platform_sessions';
const DAILY = 'resource_management_group_scrape_daily';

const waRoot = resolve(
  process.env.APPDATA || '',
  'resource-management',
  'wa-sessions',
);

async function main() {
  const { data: accounts, error } = await sb
    .from(MA)
    .select('id, label, platform, phone_number, is_active')
    .eq('is_active', true)
    .order('label');

  if (error) {
    console.error('GAGAL baca akun:', error.message);
    process.exit(1);
  }

  const { data: sessions } = await sb
    .from(PS)
    .select('account_id, session_type, is_active, session_data')
    .eq('is_active', true);

  const { data: daily } = await sb
    .from(DAILY)
    .select('account_id, acc_name, phone_number, group_id, group_name, scrape_date')
    .order('scraped_at', { ascending: false });

  console.log('=== AUDIT AKUN (fakta Supabase + disk) ===\n');
  let issues = 0;

  for (const acc of accounts ?? []) {
    const activeSess = (sessions ?? []).filter((s) => s.account_id === acc.id);
    const dailyRows = (daily ?? []).filter((d) => d.account_id === acc.id);
    const today = new Date().toISOString().slice(0, 10);
    const dailyToday = dailyRows.filter((d) => d.scrape_date === today);
    const diskDir = existsSync(waRoot)
      ? resolve(waRoot, `session-${acc.id}`)
      : null;
    const diskOk = diskDir && existsSync(diskDir);

    console.log(`[${acc.label}] ${acc.platform}`);
    console.log(`  account_id: ${acc.id}`);
    console.log(`  phone: ${acc.phone_number}`);
    console.log(`  platform_sessions aktif: ${activeSess.length}`);
    for (const s of activeSess) {
      const sd = String(s.session_data ?? '').slice(0, 36);
      const match = sd === acc.id ? 'OK' : `MISMATCH session_data=${sd}`;
      console.log(`    - ${s.session_type} ${match}`);
      if (sd !== acc.id && s.session_type === 'whatsapp_local_auth') {
        issues += 1;
      }
    }
    if (acc.platform === 'whatsapp' && activeSess.length === 0 && diskOk) {
      console.log('  MASALAH: disk WA ada, DB session KOSONG → Sync selalu QR');
      issues += 1;
    }
    if (acc.platform === 'whatsapp' && !diskOk && activeSess.length === 0) {
      console.log('  MASALAH: belum login WA (no disk, no DB session)');
      issues += 1;
    }
    console.log(`  daily rows total: ${dailyRows.length}, today: ${dailyToday.length}`);
    if (dailyToday.length > 0) {
      const sample = dailyToday.slice(0, 2).map((r) => r.group_name).join(', ');
      console.log(`  sample groups today: ${sample}`);
    }
    console.log(`  wa disk folder: ${diskOk ? 'ADA' : 'TIDAK'}\n`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const dailyByAccount = new Map();
  for (const row of daily ?? []) {
    if (row.scrape_date !== today) continue;
    const list = dailyByAccount.get(row.account_id) ?? [];
    list.push(row.group_id);
    dailyByAccount.set(row.account_id, list);
  }
  const ids = [...dailyByAccount.keys()];
  if (ids.length >= 2) {
    const a = new Set(dailyByAccount.get(ids[0]) ?? []);
    const b = dailyByAccount.get(ids[1]) ?? [];
    const same = b.filter((g) => a.has(g)).length;
    if (same === b.length && b.length > 0 && a.size === b.length) {
      console.log('MASALAH KRITIS: 2 akun punya grup daily IDENTIK hari ini → scraper pakai session sama');
      issues += 1;
    }
  }

  console.log(`\nTotal masalah terdeteksi: ${issues}`);
  process.exit(issues > 0 ? 1 : 0);
}

main();
