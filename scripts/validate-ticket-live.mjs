/**
 * Validasi LIVE: bookmark grid metrics = breakdown engine = ticket open DB.
 * Tanpa deploy — baca Supabase langsung.
 *
 * Usage:
 *   node scripts/validate-ticket-live.mjs --brand SBMY
 *   node scripts/validate-ticket-live.mjs --account Edwin
 */
import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/loadEnv.mjs';
import { fetchAllRows } from './lib/supabaseFetch.mjs';
import {
  computeAccountTicketBreakdown,
  bookmarkMetricsFromBreakdown,
} from './lib/ticketCompareCore.mjs';

const TABLES = {
  messagingAccounts: 'resource_management_messaging_accounts',
  groupsMaster: 'resource_management_groups_master',
  groupScrapeDaily: 'resource_management_group_scrape_daily',
  tickets: 'resource_management_tickets',
  brands: 'resource_management_brands',
};

const TICKET_TYPES = [
  'daily_junk_group',
  'missing_group',
  'not_admin',
  'duplicate_group_id',
  'duplicate_group_name',
];

function parseArgs(argv) {
  const out = { brand: null, account: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--brand' && argv[i + 1]) out.brand = argv[++i].trim();
    if (argv[i] === '--account' && argv[i + 1]) out.account = argv[++i].trim();
  }
  return out;
}

function countOpenTicketsByType(tickets) {
  const counts = Object.fromEntries(TICKET_TYPES.map((t) => [t, 0]));
  for (const t of tickets) {
    if (t.status !== 'open') continue;
    if (counts[t.ticket_type] !== undefined) counts[t.ticket_type] += 1;
  }
  return counts;
}

function expectedTicketCounts(breakdown) {
  return {
    daily_junk_group: breakdown.junk.length,
    missing_group: breakdown.missing.length,
    not_admin: breakdown.notAdmin.length,
    duplicate_group_id: breakdown.duplicateGroupId.length,
    duplicate_group_name: breakdown.duplicateGroupName.length,
  };
}

async function loadMasterDaily(supabase, accountId, brandName, platform) {
  const [masterRows, dailyRows] = await Promise.all([
    fetchAllRows(supabase, TABLES.groupsMaster, 'group_id, group_name, invite_link', [
      { column: 'brand', value: brandName },
      { column: 'platform', value: platform },
    ]),
    fetchAllRows(
      supabase,
      TABLES.groupScrapeDaily,
      'group_id, group_name, invite_link, is_admin',
      [{ column: 'account_id', value: accountId }],
    ),
  ]);
  return { masterRows, dailyRows };
}

async function auditAccount(supabase, acc, brandNameById, failures) {
  const brandName = brandNameById.get(acc.brand_id) || String(acc.metadata?.brand ?? '').trim();
  if (!brandName) {
    failures.push({ account: acc.label, reason: 'brand kosong' });
    return;
  }

  const { masterRows, dailyRows } = await loadMasterDaily(
    supabase,
    acc.id,
    brandName,
    acc.platform,
  );

  const breakdown = computeAccountTicketBreakdown(masterRows, dailyRows);
  const metrics = bookmarkMetricsFromBreakdown(breakdown);
  const expected = expectedTicketCounts(breakdown);

  const openTickets = await fetchAllRows(
    supabase,
    TABLES.tickets,
    'ticket_type, group_id, status',
    [
      { column: 'account_id', value: acc.id },
      { column: 'status', value: 'open' },
    ],
  );

  const openCounts = countOpenTicketsByType(openTickets);

  console.log(`\n=== ${acc.label} (${acc.phone_number}) · ${brandName} · ${acc.platform} ===`);
  console.log(
    `Grid (engine): Groups ${metrics.groupsCurrent}/${metrics.groupsTotal} | Admin ${metrics.adminCurrent}/${metrics.adminTotal}`,
  );
  console.log(
    `Invariant: Y-X=${metrics.gapYMinusX} junk-missing=${metrics.junkMinusMissing} | notAdmin=${metrics.notAdmin} joined-admin=${metrics.notAdminFromJoined}`,
  );
  console.log(`Fetch rows: master=${masterRows.length} daily=${dailyRows.length} tickets=${openTickets.length}`);

  if (metrics.junkMinusMissing !== metrics.gapYMinusX) {
    failures.push({
      account: acc.label,
      reason: `invariant junk-missing (${metrics.junkMinusMissing}) ≠ Y-X (${metrics.gapYMinusX})`,
    });
  }

  if (metrics.notAdmin !== metrics.notAdminFromJoined) {
    failures.push({
      account: acc.label,
      reason: `notAdmin (${metrics.notAdmin}) ≠ joined-admin (${metrics.notAdminFromJoined})`,
    });
  }

  const typeLines = [];
  for (const type of TICKET_TYPES) {
    const exp = expected[type];
    const db = openCounts[type];
    const ok = exp === db;
    typeLines.push(`${type}: expect=${exp} db=${db} ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) {
      failures.push({
        account: acc.label,
        reason: `ticket ${type}: expect ${exp}, DB open ${db}`,
      });
    }
  }
  console.log('Ticket:', typeLines.join(' | '));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { env, path: envPath } = loadProjectEnv();
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!url || !key) {
    console.error('FAIL: VITE_SUPABASE_URL / key kosong. Env:', envPath ?? 'tidak ada');
    process.exit(1);
  }

  console.log('=== VALIDASI LIVE ticket vs bookmark ===');
  console.log('Env:', envPath);
  console.log('Supabase:', new URL(url).host);

  const supabase = createClient(url, key);

  const brands = await fetchAllRows(supabase, TABLES.brands, 'id, name', []);
  const brandNameById = new Map(brands.map((b) => [b.id, String(b.name ?? '').trim()]));

  let accounts = await fetchAllRows(
    supabase,
    TABLES.messagingAccounts,
    'id, label, phone_number, brand_id, platform, metadata, is_active',
    [],
  );
  accounts = accounts.filter((a) => a.is_active);

  if (args.brand) {
    const brandIds = new Set(
      [...brandNameById.entries()]
        .filter(([, n]) => n.toLowerCase() === args.brand.toLowerCase())
        .map(([id]) => id),
    );
    if (!brandIds.size) {
      console.error(`FAIL: brand "${args.brand}" tidak ditemukan`);
      process.exit(1);
    }
    accounts = accounts.filter((a) => brandIds.has(a.brand_id));
  }

  if (args.account) {
    const needle = args.account.toLowerCase();
    accounts = accounts.filter(
      (a) =>
        String(a.label ?? '').toLowerCase().includes(needle) ||
        String(a.phone_number ?? '').includes(needle),
    );
  }

  accounts.sort((a, b) => String(a.label).localeCompare(String(b.label)));

  if (!accounts.length) {
    console.error('FAIL: tidak ada akun yang cocok filter');
    process.exit(1);
  }

  console.log(`Akun di-audit: ${accounts.length}`);

  const failures = [];
  for (const acc of accounts) {
    await auditAccount(supabase, acc, brandNameById, failures);
  }

  console.log('\n=== RINGKASAN ===');
  if (!failures.length) {
    console.log(`PASS — ${accounts.length} akun: engine = invariant = ticket DB`);
    process.exit(0);
  }

  console.log(`FAIL — ${failures.length} masalah:`);
  for (const f of failures) {
    console.log(`  - [${f.account}] ${f.reason}`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error('FAIL:', e.message ?? e);
  process.exit(1);
});
