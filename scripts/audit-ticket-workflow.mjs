/** Cek issue handle + filter In Progress vs DB ticket count */
import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/loadEnv.mjs';
import { fetchAllRows } from './lib/supabaseFetch.mjs';

const { env } = loadProjectEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

const TYPE_CODE = {
  missing_group: 'MG',
  not_admin: 'NA',
  duplicate_group_id: 'DI',
  duplicate_group_name: 'DN',
  daily_junk_group: 'JK',
};

function buildIssueId(accountId, brandName, platform, ticketType) {
  const acc = accountId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const brand =
    brandName
      .trim()
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase() || 'BRAND';
  const plat = platform === 'whatsapp' ? 'WA' : 'TG';
  return `ISS-${brand}-${plat}-${acc}-${TYPE_CODE[ticketType]}`;
}

const accounts = await fetchAllRows(sb, 'resource_management_messaging_accounts', 'id, label, brand_id, platform', []);
const bella = accounts.find((a) => String(a.label).includes('Bella'));
const brands = await fetchAllRows(sb, 'resource_management_brands', 'id, name', []);
const brandName = brands.find((b) => b.id === bella.brand_id)?.name ?? 'SBMY';

const tickets = await fetchAllRows(sb, 'resource_management_tickets', 'ticket_type, group_id', [
  { column: 'account_id', value: bella.id },
  { column: 'status', value: 'open' },
]);

const byType = {};
for (const t of tickets) {
  byType[t.ticket_type] = (byType[t.ticket_type] ?? 0) + 1;
}

const handles = await fetchAllRows(sb, 'resource_management_ticket_issue_handles', '*', [
  { column: 'account_id', value: bella.id },
]);

console.log('Bella open tickets DB:', byType);
console.log('\nIssue handles (workflow bookmark):');
for (const type of [
  'daily_junk_group',
  'missing_group',
  'not_admin',
  'duplicate_group_id',
  'duplicate_group_name',
]) {
  const issueId = buildIssueId(bella.id, brandName, bella.platform, type);
  const h = handles.find((x) => x.issue_id === issueId);
  const dbCount = byType[type] ?? 0;
  const status = h?.task_status ?? '(no handle → todo → In Progress)';
  const inProgress = !h || h.task_status === 'todo' || h.task_status === 'in_progress' || h.task_status === 'interrupted';
  console.log(`  ${type}: DB=${dbCount} | handle=${status} | tampil In Progress=${inProgress}`);
}
