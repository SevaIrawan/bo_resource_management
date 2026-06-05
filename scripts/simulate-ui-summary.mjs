/** Simulasi groupOpenTickets + filter In Progress seperti UI */
import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/loadEnv.mjs';
import { fetchAllRows } from './lib/supabaseFetch.mjs';

const TICKET_SELECT = `id, account_id, brand_id, platform, ticket_type, status, description, group_link, group_id, group_name, created_at,
  resource_management_messaging_accounts(label, phone_number),
  resource_management_brands(name)`;

function openTicketDedupeKey(ticketType, groupId) {
  const gid = String(groupId ?? '').trim();
  return gid ? `${ticketType}|${gid}` : `${ticketType}|__account__`;
}

function dedupeOpenTicketItems(tickets) {
  const map = new Map();
  for (const t of tickets) {
    const key = openTicketDedupeKey(t.ticketType, t.groupId);
    if (!map.has(key)) map.set(key, t);
  }
  return [...map.values()];
}

function toTicketItem(row) {
  const acc = Array.isArray(row.resource_management_messaging_accounts)
    ? row.resource_management_messaging_accounts[0]
    : row.resource_management_messaging_accounts;
  const brand = Array.isArray(row.resource_management_brands)
    ? row.resource_management_brands[0]
    : row.resource_management_brands;
  if (!acc || !brand) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    ticketType: row.ticket_type,
    accountName: acc.label,
    brandName: brand.name,
    platform: row.platform,
    phoneNumber: acc.phone_number ?? '',
    description: row.description,
    groupLink: row.group_link,
    groupId: row.group_id,
    groupName: row.group_name,
  };
}

function groupOpenTickets(tickets) {
  const map = new Map();
  for (const ticket of tickets) {
    const key = `${ticket.accountId}|${ticket.brandName}|${ticket.platform}|${ticket.ticketType}`;
    let group = map.get(key);
    if (!group) {
      group = {
        accountName: ticket.accountName,
        ticketType: ticket.ticketType,
        itemCount: 0,
        lines: [],
      };
      map.set(key, group);
    }
    const lineKey = [
      ticket.groupId?.trim() || '',
      ticket.groupName?.trim().toLowerCase() || '',
      ticket.description,
    ].join('|');
    const exists = group.lines.some(
      (l) =>
        [l.groupId?.trim() || '', l.groupName?.trim().toLowerCase() || '', l.description].join('|') ===
        lineKey,
    );
    if (!exists) {
      group.lines.push({
        groupId: ticket.groupId,
        groupName: ticket.groupName,
        description: ticket.description,
      });
    }
    group.itemCount = group.lines.length;
  }
  return [...map.values()];
}

const { env } = loadProjectEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY);

const { data: admin } = await sb.from('users').select('id').ilike('username', 'admin').maybeSingle();
const accounts = await fetchAllRows(sb, 'resource_management_messaging_accounts', 'id, label', [
  { column: 'user_id', value: admin.id },
  { column: 'is_active', value: true },
]);

const bella = accounts.find((a) => String(a.label).includes('Bella'));
const rows = await fetchAllRows(sb, 'resource_management_tickets', TICKET_SELECT, [
  { column: 'account_id', value: bella.id },
  { column: 'status', value: 'open' },
]);

const dropped = rows.filter((r) => !toTicketItem(r));
const items = dedupeOpenTicketItems(
  rows
    .filter((r) => r.ticket_type !== 'group_count_mismatch')
    .map(toTicketItem)
    .filter(Boolean),
);
const bellaItems = items.filter((t) => t.accountName.includes('Bella'));
const summaries = groupOpenTickets(bellaItems);

console.log('Raw open rows:', rows.length);
console.log('Dropped (join null):', dropped.length);
console.log('Items after toTicketItem+dedupe:', bellaItems.length);
console.log('\nSummary cards (sama UI):');
for (const s of summaries.sort((a, b) => a.ticketType.localeCompare(b.ticketType))) {
  console.log(`  ${s.ticketType}: ${s.itemCount} groups`);
}

// group_id kosong per tipe
const emptyGid = {};
for (const r of rows) {
  const t = r.ticket_type;
  const gid = String(r.group_id ?? '').trim();
  if (!gid) emptyGid[t] = (emptyGid[t] ?? 0) + 1;
}
console.log('\nTicket tanpa group_id:', emptyGid);
