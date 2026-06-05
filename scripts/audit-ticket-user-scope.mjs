import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/loadEnv.mjs';
import { fetchAllRows } from './lib/supabaseFetch.mjs';

const { env } = loadProjectEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

const users = await fetchAllRows(sb, 'users', 'id, username', []);
const accounts = await fetchAllRows(sb, 'resource_management_messaging_accounts', 'id, label, user_id, is_active', []);

console.log('Users:', users.map((u) => `${u.username}=${u.id}`).join(', '));

const byUser = new Map();
for (const a of accounts.filter((x) => x.is_active)) {
  const k = a.user_id;
  if (!byUser.has(k)) byUser.set(k, []);
  byUser.get(k).push(a.label);
}

for (const [uid, labels] of byUser) {
  const uname = users.find((u) => u.id === uid)?.username ?? '?';
  const tickets = await fetchAllRows(sb, 'resource_management_tickets', 'id', [
    { column: 'status', value: 'open' },
  ]);
  const accIds = accounts.filter((a) => a.user_id === uid && a.is_active).map((a) => a.id);
  const openForUser = tickets.filter((t) => accIds.includes(t.account_id));
  console.log(`\nuser ${uname} (${uid}): ${labels.length} akun aktif`);
  console.log('  akun:', labels.join(', '));
  console.log('  open tickets:', openForUser.length);
}
