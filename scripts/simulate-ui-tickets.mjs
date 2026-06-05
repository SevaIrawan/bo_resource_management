/** Simulasi loadOpenTicketsForUser + groupOpenTickets seperti UI */
import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/loadEnv.mjs';
import { fetchAllRows } from './lib/supabaseFetch.mjs';

const TABLES = {
  messagingAccounts: 'resource_management_messaging_accounts',
  tickets: 'resource_management_tickets',
  users: 'users',
};

const TICKET_SELECT = `id, account_id, brand_id, platform, ticket_type, status, description, group_link, group_id, group_name, created_at,
  resource_management_messaging_accounts(label, phone_number),
  resource_management_brands(name)`;

const { env } = loadProjectEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY);

// admin user id (sama monitoringDataUser)
const { data: admin } = await sb
  .from(TABLES.users)
  .select('id')
  .ilike('username', 'admin')
  .maybeSingle();
const userId = admin?.id;
if (!userId) {
  console.error('admin user tidak ditemukan');
  process.exit(1);
}

const accounts = await fetchAllRows(sb, TABLES.messagingAccounts, 'id, label', [
  { column: 'user_id', value: userId },
  { column: 'is_active', value: true },
]);
const accountIds = accounts.map((a) => a.id);

// CARA UI LAMA — satu query tanpa paginate
const { data: uiQuery } = await sb
  .from(TABLES.tickets)
  .select(TICKET_SELECT)
  .in('account_id', accountIds)
  .eq('status', 'open')
  .order('created_at', { ascending: false });

const uiRows = (uiQuery ?? []).filter((r) => r.ticket_type !== 'group_count_mismatch');

// CARA BENAR — fetch all
const allRows = [];
for (const accId of accountIds) {
  const rows = await fetchAllRows(sb, TABLES.tickets, TICKET_SELECT, [
    { column: 'account_id', value: accId },
    { column: 'status', value: 'open' },
  ]);
  allRows.push(...rows.filter((r) => r.ticket_type !== 'group_count_mismatch'));
}

function summarize(rows, label) {
  const byAccType = new Map();
  for (const r of rows) {
    const acc = accounts.find((a) => a.id === r.account_id);
    const key = `${acc?.label ?? r.account_id}|${r.ticket_type}`;
    byAccType.set(key, (byAccType.get(key) ?? 0) + 1);
  }
  console.log(`\n--- ${label}: ${rows.length} baris ticket ---`);
  for (const [k, c] of [...byAccType.entries()].sort()) {
    if (k.includes('Bella')) console.log(`  ${k}: ${c}`);
  }
}

summarize(uiRows, 'Query UI (satu select .in account_ids)');
summarize(allRows, 'Fetch lengkap per akun');
