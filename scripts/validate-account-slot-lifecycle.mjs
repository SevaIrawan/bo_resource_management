/**
 * Remove slot → re-add: tidak boleh tabrakan UNIQUE (user_id, platform, label).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const messagingTs = read('src/lib/messagingAccounts.ts');
const removeHook = read('src/hooks/useRemoveAccountFromSlot.ts');
const cardList = read('src/components/group-monitoring/AccountBrandCardList.tsx');
const migration = read('supabase/migrations/017_rm_full_reset.sql');

const checks = [
  {
    name: 'Schema: UNIQUE (user_id, platform, label)',
    ok: migration.includes('rm_messaging_accounts_label_unique'),
  },
  {
    name: 'Remove slot: DELETE messaging_accounts (bukan hanya is_active=false)',
    ok:
      messagingTs.includes('removeMessagingAccountFromSlot') &&
      messagingTs.includes('.delete().eq(') &&
      !/removeMessagingAccountFromSlot[\s\S]{0,400}is_active:\s*false/.test(messagingTs),
  },
  {
    name: 'Remove slot: cabut session device dulu',
    ok:
      messagingTs.includes('invalidatePlatformSessionEverywhere') &&
      removeHook.includes('deactivateMessagingAccount'),
  },
  {
    name: 'Re-add: reactivate baris legacy is_active=false',
    ok: messagingTs.includes('reactivateInactiveMessagingAccount'),
  },
  {
    name: 'Re-add: tolak label aktif duplikat (ACCOUNT_LABEL_IN_USE)',
    ok:
      messagingTs.includes('ACCOUNT_LABEL_IN_USE') &&
      messagingTs.includes('resolveMessagingAccountSaveErrorCode'),
  },
  {
    name: 'UI: pesan khusus bukan generic DB connection',
    ok:
      cardList.includes('createMessagingAccount') &&
      read('src/components/group-monitoring/AccountBrandCard.tsx').includes('accountLabelInUse'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nAccount slot remove/re-add checks passed.');
