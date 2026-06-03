/**
 * Format badge header brand card: WA xx Acc | TG xx ACC
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const en = fs.readFileSync(path.join(root, 'src/i18n/locales/en.ts'), 'utf8');
const card = fs.readFileSync(
  path.join(root, 'src/components/group-monitoring/AccountBrandCard.tsx'),
  'utf8',
);

const checks = [
  {
    name: 'i18n akun: WA {{wa}} Acc | TG {{tg}} ACC',
    ok: en.includes("platformAccountsBadge: 'WA {{wa}} Acc | TG {{tg}} ACC'"),
  },
  {
    name: 'i18n grup: WA {{wa}} Group | TG {{tg}} Group',
    ok: en.includes("platformGroupsBadge: 'WA {{wa}} Group | TG {{tg}} Group'"),
  },
  {
    name: 'Card memakai platformAccountsBadge + platformGroupsBadge',
    ok:
      card.includes('platformAccountsBadge') && card.includes('platformGroupsBadge'),
  },
  {
    name: 'Helper countAccountsByPlatform',
    ok: card.includes('countAccountsByPlatform'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nBrand card badge checks passed.');
