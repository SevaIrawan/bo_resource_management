/**
 * Audit gap ticket vs grid — logic sama app (ticketCompareCore).
 * Usage: node scripts/audit-account-ticket-gap.mjs "Bella" "ELA" "Edwin"
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

async function auditAccount(supabase, brandNameById, needle) {
  const accounts = await fetchAllRows(
    supabase,
    TABLES.messagingAccounts,
    'id, label, phone_number, brand_id, platform, metadata, is_active',
    [],
  );
  const matches = accounts.filter(
    (a) =>
      String(a.label ?? '').toLowerCase().includes(needle.toLowerCase()) ||
      String(a.phone_number ?? '').includes(needle),
  );

  if (!matches.length) {
    console.log(`\n[${needle}] tidak ditemukan`);
    return;
  }

  for (const acc of matches.slice(0, 5)) {
    const brandName = brandNameById.get(acc.brand_id) || String(acc.metadata?.brand ?? '').trim();
    const metaBrand = String(acc.metadata?.brand ?? '').trim();

    const [masterRows, dailyRows, openTickets] = await Promise.all([
      fetchAllRows(supabase, TABLES.groupsMaster, 'group_id, group_name, invite_link', [
        { column: 'brand', value: brandName },
        { column: 'platform', value: acc.platform },
      ]),
      fetchAllRows(
        supabase,
        TABLES.groupScrapeDaily,
        'group_id, group_name, invite_link, is_admin',
        [{ column: 'account_id', value: acc.id }],
      ),
      fetchAllRows(supabase, TABLES.tickets, 'ticket_type, group_id, status', [
        { column: 'account_id', value: acc.id },
        { column: 'status', value: 'open' },
      ]),
    ]);

    const b = computeAccountTicketBreakdown(masterRows, dailyRows);
    const m = bookmarkMetricsFromBreakdown(b);

    const dbJunk = openTickets.filter((t) => t.ticket_type === 'daily_junk_group').length;
    const dbMissing = openTickets.filter((t) => t.ticket_type === 'missing_group').length;
    const dbNotAdmin = openTickets.filter((t) => t.ticket_type === 'not_admin').length;

    console.log('\n---', acc.label, '---');
    console.log('phone:', acc.phone_number);
    console.log('brand table:', brandName || '(kosong)');
    console.log('brand meta:', metaBrand || '(kosong)');
    console.log('grid Y/X:', `${m.groupsCurrent}/${m.groupsTotal}`);
    console.log('admin:', `${m.adminCurrent}/${m.adminTotal}`);
    console.log('junk expect/db:', b.junk.length, '/', dbJunk);
    console.log('missing expect/db:', b.missing.length, '/', dbMissing);
    console.log('not_admin expect/db:', b.notAdmin.length, '/', dbNotAdmin);
    console.log('dup_id expect:', b.duplicateGroupId.length);
    console.log('dup_name expect:', b.duplicateGroupName.length);
    if (dbJunk !== b.junk.length || dbMissing !== b.missing.length || dbNotAdmin !== b.notAdmin.length) {
      console.log('>>> MISMATCH ticket DB vs engine');
    }
  }
}

async function main() {
  const needles = process.argv.slice(2);
  if (!needles.length) {
    console.error('Usage: node scripts/audit-account-ticket-gap.mjs "Bella" "ELA"');
    process.exit(1);
  }

  const { env, path: envPath } = loadProjectEnv();
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !key) {
    console.error('Env kosong:', envPath);
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const brands = await fetchAllRows(supabase, TABLES.brands, 'id, name', []);
  const brandNameById = new Map(brands.map((b) => [b.id, String(b.name ?? '').trim()]));

  for (const n of needles) {
    await auditAccount(supabase, brandNameById, n);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
