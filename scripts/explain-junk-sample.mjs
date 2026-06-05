/** Sample junk groups untuk satu akun — node scripts/explain-junk-sample.mjs Bella */
import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/loadEnv.mjs';
import { fetchAllRows } from './lib/supabaseFetch.mjs';
import { computeAccountTicketBreakdown } from './lib/ticketCompareCore.mjs';

const TABLES = {
  messagingAccounts: 'resource_management_messaging_accounts',
  groupsMaster: 'resource_management_groups_master',
  groupScrapeDaily: 'resource_management_group_scrape_daily',
  brands: 'resource_management_brands',
};

const needle = (process.argv[2] || 'Bella').trim();
const { env } = loadProjectEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY);

const brands = await fetchAllRows(sb, TABLES.brands, 'id, name', []);
const brandNameById = new Map(brands.map((b) => [b.id, String(b.name ?? '').trim()]));

const accounts = await fetchAllRows(sb, TABLES.messagingAccounts, 'id, label, brand_id, platform', []);
const acc = accounts.find((a) => String(a.label).toLowerCase().includes(needle.toLowerCase()));
if (!acc) {
  console.error('Akun tidak ditemukan:', needle);
  process.exit(1);
}

const brandName = brandNameById.get(acc.brand_id) || '';
const [masterRows, dailyRows] = await Promise.all([
  fetchAllRows(sb, TABLES.groupsMaster, 'group_id, group_name, invite_link', [
    { column: 'brand', value: brandName },
    { column: 'platform', value: acc.platform },
  ]),
  fetchAllRows(sb, TABLES.groupScrapeDaily, 'group_id, group_name, invite_link, is_admin', [
    { column: 'account_id', value: acc.id },
  ]),
]);

const b = computeAccountTicketBreakdown(masterRows, dailyRows);
console.log('Akun:', acc.label, '| Brand:', brandName);
console.log('Y (daily unik):', b.dailyY, '| X (master unik):', b.masterX);
console.log('Junk:', b.junk.length, '| Missing:', b.missing.length);
console.log('Rumus: Junk - Missing = Y - X =>', b.junk.length, '-', b.missing.length, '=', b.dailyY - b.masterX);
console.log('\nContoh 8 grup JUNK (ada di WA Bella, TIDAK ada di master SBMY):');
for (const row of b.junk.slice(0, 8)) {
  console.log(`  group_id: ${row.groupId}`);
  console.log(`  nama WA: ${row.groupName ?? '(kosong)'}`);
}
