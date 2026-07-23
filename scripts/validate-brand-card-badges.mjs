/**
 * Format badge header brand card: [icon] WA/TG xxx Acc | xxx Group + modern stock chips.
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
const chips = fs.readFileSync(
  path.join(root, 'src/components/group-monitoring/AccountBrandStockChips.tsx'),
  'utf8',
);
const groupModal = fs.readFileSync(
  path.join(root, 'src/components/group-monitoring/BrandMasterGroupsModal.tsx'),
  'utf8',
);
const list = fs.readFileSync(
  path.join(root, 'src/components/group-monitoring/AccountBrandCardList.tsx'),
  'utf8',
);
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');

const checks = [
  {
    name: 'i18n summary Group | Acc | Logout | Not aligned',
    ok:
      en.includes("platformSummaryAccSuffix: 'Acc'") &&
      en.includes("platformSummaryGroupSuffix: 'Group'") &&
      en.includes("platformSummaryLogoutSuffix: 'Logout'") &&
      en.includes("platformSummaryNotAlignedSuffix: 'Not aligned'") &&
      en.includes('platformSummaryAria'),
  },
  {
    name: 'Card: platform summary Group | Acc | Logout | Not aligned',
    ok:
      card.includes('brand-card-badge--platform-summary') &&
      card.includes('brand-card-badge-group-btn') &&
      card.includes('brand-card-badge-count--group') &&
      card.includes('brand-card-badge-count--alert') &&
      card.includes('brand-card-badge-caption-label') &&
      card.includes('platformSummaryLogoutSuffix') &&
      card.includes('platformSummaryNotAlignedSuffix') &&
      card.includes('BrandMasterGroupsModal') &&
      !card.includes('BrandPlatformGroupsBadgeButton'),
  },
  {
    name: 'CSS: caption abu + angka berwarna (Group hijau, Ready biru)',
    ok:
      css.includes('brand-card-badge-count--group') &&
      css.includes('brand-card-badge-caption-label') &&
      css.includes('.account-brand-stock-chip--ready .account-brand-stock-chip-count') &&
      css.includes('color: #4ade80') &&
      css.includes('color: #60a5fa'),
  },
  {
    name: 'Group klik: Reporting matrix + Full Group/Admin + filter Acc',
    ok:
      groupModal.includes('ReportingJoinMatrixTable') &&
      groupModal.includes("['full_group', 'full_admin']") &&
      groupModal.includes('filterReportingMatrixRows') &&
      groupModal.includes('columnFilter={columnFilter}') &&
      css.includes('.brand-card-badge-group-btn') &&
      css.includes('text-decoration: underline'),
  },
  {
    name: 'Card: AccountBrandStockChips tanpa Active (Ready/Recycle/Review)',
    ok:
      card.includes('AccountBrandStockChips') &&
      card.includes('onBucketClick') &&
      !card.includes('OperationsGroupStockStrip') &&
      !card.includes('operations-stock-panel') &&
      chips.includes('ACCOUNT_HEADER_STOCK_BUCKETS') &&
      chips.includes('account-brand-stock-chip-count') &&
      chips.includes('account-brand-stock-chip-label') &&
      !chips.includes('account-brand-stock-chip-dot') &&
      chips.indexOf('account-brand-stock-chip-count') <
        chips.indexOf('account-brand-stock-chip-label') &&
      chips.includes('onBucketClick') &&
      list.includes('loadOperationsStockCountsByBrandPlatform') &&
      list.includes('readGroupStockCounts'),
  },
  {
    name: 'CSS: Operations stock strip 4 kolom (tanpa slot Other kosong)',
    ok:
      css.includes('grid-template-columns: repeat(4, minmax(0, 1fr))') &&
      !css.includes('grid-template-columns: repeat(5, minmax(0, 1fr))') &&
      !css.includes('.operations-stock-chip:nth-child(5)'),
  },
  {
    name: 'Card: platform filter resolved ke WA/TG (tanpa all badges)',
    ok:
      card.includes('resolveHeaderPlatform') &&
      card.includes("activePlatformFilter = 'whatsapp'") &&
      !card.includes('showAllPlatforms'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nBrand card badge checks passed.');
