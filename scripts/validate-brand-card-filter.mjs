/**
 * Kartu brand dengan 0 akun harus tetap di daftar (Add Card / brand DB tanpa messaging account).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const filterTs = read('src/lib/filterAccountGroups.ts');
const cardListTs = read('src/components/group-monitoring/AccountBrandCardList.tsx');
const utilsTs = read('src/lib/accountBrandUtils.ts');
const removeTs = read('src/hooks/useRemoveAccountFromSlot.ts');
const brandsTs = read('src/lib/brands.ts');
const providerTs = read('src/providers/GroupMonitoringProvider.tsx');
const realtimeTs = read('src/hooks/useRealtimeMonitoring.ts');
const bodyTs = read('src/components/group-monitoring/AccountMonitoringBody.tsx');

const checks = [
  {
    name: 'Tidak ada filter "accounts.length > 0" yang buang kartu brand',
    ok: !/\.filter\(\(group\)\s*=>\s*group\.accounts\.length\s*>\s*0\)/.test(filterTs),
  },
  {
    name: 'Search boleh match nama brand (kartu kosong)',
    ok: filterTs.includes('brandNameMatchesSearch'),
  },
  {
    name: 'Add brand pakai onGroupsChange functional updater',
    ok: cardListTs.includes('onGroupsChange((prev)'),
  },
  {
    name: 'ID kartu pakai brandGroupId + dbBrandId',
    ok: utilsTs.includes('brandGroupId(') && utilsTs.includes('dbBrandId'),
  },
  {
    name: 'Remove account pakai functional updater (bukan closure groups)',
    ok:
      removeTs.includes('Dispatch<SetStateAction') &&
      removeTs.includes('onGroupsChange((prev)') &&
      !removeTs.includes('groups.map'),
  },
  {
    name: 'Remove brand card hapus dari database (bukan dismiss UI)',
    ok: brandsTs.includes('removeBrandCompletely') && cardListTs.includes('removeBrandCompletely'),
  },
  {
    name: 'removeBrandCompletely bersihkan semua tabel terkait',
    ok:
      brandsTs.includes('ticketIssueHandles') &&
      brandsTs.includes('syncActivityLogs') &&
      brandsTs.includes('groupScrapeDaily') &&
      brandsTs.includes('groupsMaster') &&
      brandsTs.includes('accountSnapshots') &&
      brandsTs.includes('scrapeRuns'),
  },
  {
    name: 'Modal remove brand = pola RemoveAccountModal',
    ok: (() => {
      const modal = fs.readFileSync(
        path.join(root, 'src/components/group-monitoring/RemoveBrandModal.tsx'),
        'utf8',
      );
      const account = fs.readFileSync(
        path.join(root, 'src/components/group-monitoring/RemoveAccountModal.tsx'),
        'utf8',
      );
      return (
        modal.includes('brand-modal-header') &&
        modal.includes('sync-modal-message') &&
        !modal.includes('removeBrandAccountsLine') &&
        account.includes('brand-modal-header') &&
        account.includes('sync-modal-message')
      );
    })(),
  },
  {
    name: 'Provider tidak pakai dismissedBrandGroupIds',
    ok: !providerTs.includes('dismissedBrandGroupIds'),
  },
  {
    name: 'Realtime merge metrik (bukan replace state absolut)',
    ok: realtimeTs.includes('mergeGroupsAccountMetrics'),
  },
  {
    name: 'Table view tampil jika ada brand (bukan hanya baris akun)',
    ok: bodyTs.includes('filteredGroups.length > 0'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nBrand card filter checks passed.');
