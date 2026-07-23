/**
 * LIVE audit: metrik grid (engine master↔daily) vs isi DB Supabase.
 * TIDAK ubah app/DB — baca saja.
 *
 * Usage:
 *   node scripts/validate-grid-db-live.mjs
 *   node scripts/validate-grid-db-live.mjs --brand STMY
 *   node scripts/validate-grid-db-live.mjs --account "Lina CS"
 *   node scripts/validate-grid-db-live.mjs --fail-on-warn
 */
import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/loadEnv.mjs';
import { fetchAllRows } from './lib/supabaseFetch.mjs';
import {
  computeAccountTicketBreakdown,
  bookmarkMetricsFromBreakdown,
} from './lib/accountCompareCore.mjs';

const TABLES = {
  messagingAccounts: 'resource_management_messaging_accounts',
  groupsMaster: 'resource_management_groups_master',
  groupScrapeDaily: 'resource_management_group_scrape_daily',
  scrapeRuns: 'resource_management_scrape_runs',
  brands: 'resource_management_brands',
};

function parseArgs(argv) {
  const out = { brand: null, account: null, failOnWarn: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--brand' && argv[i + 1]) out.brand = argv[++i].trim();
    if (argv[i] === '--account' && argv[i + 1]) out.account = argv[++i].trim();
    if (argv[i] === '--fail-on-warn') out.failOnWarn = true;
  }
  return out;
}

function latestCompletedRun(runs) {
  const completed = runs
    .filter((r) => r.status === 'completed')
    .sort((a, b) => String(b.completed_at ?? b.started_at).localeCompare(String(a.completed_at ?? a.started_at)));
  return completed[0] ?? null;
}

function latestRunningRun(runs) {
  return runs.find((r) => r.status === 'running') ?? null;
}

async function auditAccount(supabase, acc, brandName, runs, warnings) {
  const [masterRows, dailyRows] = await Promise.all([
    fetchAllRows(supabase, TABLES.groupsMaster, 'group_id, group_name, invite_link', [
      { column: 'brand', value: brandName },
      { column: 'platform', value: acc.platform },
    ]),
    fetchAllRows(
      supabase,
      TABLES.groupScrapeDaily,
      'group_id, group_name, invite_link, is_admin, scraped_at',
      [{ column: 'account_id', value: acc.id }],
    ),
  ]);

  const breakdown = computeAccountTicketBreakdown(masterRows, dailyRows);
  const m = bookmarkMetricsFromBreakdown(breakdown);
  const lastOk = latestCompletedRun(runs);
  const running = latestRunningRun(runs);
  const dailyDistinct = breakdown.dailyY;
  const joined = breakdown.joinedInMaster;

  const issues = [];

  if (dailyDistinct === 0 && lastOk && (lastOk.groups_success ?? 0) > 0) {
    issues.push(
      `DAILY_KOSONG tapi scrape_runs completed groups_success=${lastOk.groups_success} (${lastOk.started_at})`,
    );
  }

  if (lastOk && dailyDistinct > 0 && lastOk.groups_success != null && dailyDistinct !== lastOk.groups_success) {
    issues.push(
      `DAILY_VS_SCRAPE daily=${dailyDistinct} != scrape_runs.groups_success=${lastOk.groups_success}`,
    );
  }

  if (running && dailyDistinct === 0) {
    issues.push(`SCRAPE_RUNNING + daily=0 (started ${running.started_at})`);
  }

  if (joined > m.groupsTotal && m.groupsTotal > 0) {
    issues.push(`JOINED_GT_X in_brand=${joined} > X=${m.groupsTotal}`);
  }

  if (issues.length) {
    warnings.push({
      label: acc.label,
      phone: acc.phone_number,
      brand: brandName,
      platform: acc.platform,
      accountId: acc.id,
      onDevice: dailyDistinct,
      inBrand: `${joined}/${m.groupsTotal}`,
      admin: `${breakdown.adminInMaster}/${m.groupsTotal}`,
      issues,
    });
  }

  return {
    label: acc.label,
    onDevice: dailyDistinct,
    inBrand: joined,
    x: m.groupsTotal,
    admin: breakdown.adminInMaster,
    junk: breakdown.junk.length,
    missing: breakdown.missing.length,
    lastScrapeGroups: lastOk?.groups_success ?? null,
    issues,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { env, path: envPath } = loadProjectEnv();
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) {
    console.error('Env kosong:', envPath);
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const [accounts, brands, allRuns] = await Promise.all([
    fetchAllRows(
      supabase,
      TABLES.messagingAccounts,
      'id, label, phone_number, brand_id, platform, metadata, is_active',
      [],
    ),
    fetchAllRows(supabase, TABLES.brands, 'id, name', []),
    fetchAllRows(
      supabase,
      TABLES.scrapeRuns,
      'account_id, status, started_at, completed_at, groups_success, error_message',
      [],
    ),
  ]);

  const brandNameById = new Map(brands.map((b) => [b.id, String(b.name ?? '').trim()]));
  const runsByAccount = new Map();
  for (const run of allRuns) {
    const id = run.account_id;
    if (!id) continue;
    if (!runsByAccount.has(id)) runsByAccount.set(id, []);
    runsByAccount.get(id).push(run);
  }

  let filtered = accounts.filter((a) => a.is_active !== false);
  if (args.brand) {
    const key = args.brand.toLowerCase();
    filtered = filtered.filter((a) => {
      const bn = brandNameById.get(a.brand_id) || String(a.metadata?.brand ?? '');
      return bn.toLowerCase() === key;
    });
  }
  if (args.account) {
    const needle = args.account.toLowerCase();
    filtered = filtered.filter(
      (a) =>
        String(a.label ?? '').toLowerCase().includes(needle) ||
        String(a.phone_number ?? '').includes(args.account),
    );
  }

  console.log(`Grid vs DB live — ${filtered.length} akun (env: ${envPath})\n`);
  console.log(
    'Kolom grid dari engine: On device=dailyY, Missing=X−joined, Not admin=joined−admin\n',
  );

  const warnings = [];
  let okCount = 0;

  for (const acc of filtered) {
    const brandName = brandNameById.get(acc.brand_id) || String(acc.metadata?.brand ?? '').trim();
    if (!brandName) continue;

    const row = await auditAccount(
      supabase,
      acc,
      brandName,
      runsByAccount.get(acc.id) ?? [],
      warnings,
    );

    if (row.issues.length === 0) {
      okCount += 1;
      continue;
    }

    console.log(`WARN  ${row.label} (${brandName})`);
    console.log(`      on_device=${row.onDevice}  in_brand=${row.inBrand}/${row.x}  admin=${row.admin}/${row.x}`);
    console.log(`      last scrape groups_success=${row.lastScrapeGroups ?? '—'}`);
    for (const issue of row.issues) console.log(`      → ${issue}`);
    console.log('');
  }

  console.log('--- Ringkasan ---');
  console.log(`OK (tanpa anomaly DB): ${okCount}/${filtered.length}`);
  console.log(`WARN (anomaly DB / scrape vs daily): ${warnings.length}`);

  if (warnings.length) {
    console.log('\nAnomaly = fakta di Supabase, bukan state UI React.');
    console.log('UI 0/X atau angka loncat bisa terjadi meski baris ini OK (realtime mid-scrape).');
  }

  if (args.failOnWarn && warnings.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
