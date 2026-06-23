/**
 * Validasi detail: brand card tampil (0 akun), remove card = DB clean, modal warning, i18n.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function getByPath(obj, dotPath) {
  return dotPath.split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) return acc[key];
    return undefined;
  }, obj);
}

function parseLocaleGroupMonitoring(localePath) {
  const raw = read(localePath);
  const start = raw.indexOf('groupMonitoring:');
  if (start < 0) return {};
  const slice = raw.slice(start);
  const keys = {};
  const re = /^\s{4}(\w+):/gm;
  let m;
  while ((m = re.exec(slice)) !== null) {
    keys[m[1]] = true;
  }
  return keys;
}

/** Simulasi filter — brand 0 akun tidak boleh hilang */
function simulateFilter(groups, filters) {
  const q = filters.search.trim().toLowerCase();
  return groups
    .filter((group) => {
      if (filters.brand !== 'all' && group.brandName !== filters.brand) return false;
      if (!q) return true;
      if (group.brandName.trim().toLowerCase().includes(q)) return true;
      return group.accounts.some((row) =>
        [row.accountName, row.phoneNumber, group.brandName, row.platform, row.status]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    })
    .map((group) => {
      const accounts = group.accounts.filter((row) => {
        if (filters.platform !== 'all' && row.platform !== filters.platform) return false;
        if (filters.status !== 'all' && row.status !== filters.status) return false;
        return true;
      });
      return { ...group, accounts, accountCount: accounts.length };
    });
}

const filterTs = read('src/lib/filterAccountGroups.ts');
const brandsTs = read('src/lib/brands.ts');
const cardListTs = read('src/components/group-monitoring/AccountBrandCardList.tsx');
const modalTs = read('src/components/group-monitoring/RemoveBrandModal.tsx');
const loadTs = read('src/lib/loadAccountMonitoring.ts');
const enKeys = parseLocaleGroupMonitoring('src/i18n/locales/en.ts');
const zhKeys = parseLocaleGroupMonitoring('src/i18n/locales/zh.ts');

const removeBrandI18nKeys = [
  'removeBrandTitle',
  'removeBrandBody',
  'removeBrandConfirm',
  'removingBrand',
  'removeBrandFailed',
];

const mockGroups = [
  {
    id: 'brand-sbmy-uuid',
    brandName: 'SBMY',
    accounts: [],
    accountCount: 0,
    dbBrandId: 'uuid-sbmy',
  },
  {
    id: 'brand-wbsg-uuid',
    brandName: 'WBSG',
    accounts: [
      {
        id: 'acc-1',
        platform: 'whatsapp',
        accountName: 'Main',
        phoneNumber: '+1',
        brandName: 'WBSG',
        status: 'active',
      },
    ],
    accountCount: 1,
    dbBrandId: 'uuid-wbsg',
  },
];

const filteredDefault = simulateFilter(mockGroups, {
  brand: 'all',
  platform: 'all',
  status: 'all',
  search: '',
});

const RM_TABLES_ACCOUNT_CASCADE = [
  'resource_management_platform_sessions',
  'resource_management_platform_session_logs',
];

const REMOVE_EXPLICIT = [
  ['syncActivityLogs', 'resource_management_sync_activity_logs', 'account_id'],
  ['scrapeRuns', 'resource_management_scrape_runs', 'account_id'],
  ['groupScrapeDaily', 'resource_management_group_scrape_daily', 'account_id + brand'],
  ['groupsMaster', 'resource_management_groups_master', 'brand'],
  ['accountSnapshots', 'resource_management_account_snapshots', 'brand_id'],
  ['messagingAccounts', 'resource_management_messaging_accounts', 'brand_id'],
  ['brands', 'resource_management_brands', 'id'],
];

const checks = [
  {
    id: 'F01',
    area: 'filterAccountGroups',
    name: 'SBMY (0 akun) + WBSG (1 akun) → 2 grup setelah filter default',
    ok: filteredDefault.length === 2 && filteredDefault.some((g) => g.brandName === 'SBMY'),
  },
  {
    id: 'F02',
    area: 'filterAccountGroups',
    name: 'Tidak ada .filter(group => group.accounts.length > 0)',
    ok: !/\.filter\(\(group\)\s*=>\s*group\.accounts\.length\s*>\s*0\)/.test(filterTs),
  },
  {
    id: 'F03',
    area: 'filterAccountGroups',
    name: 'brandNameMatchesSearch ada (kartu kosong lolos search)',
    ok: filterTs.includes('brandNameMatchesSearch'),
  },
  {
    id: 'L01',
    area: 'loadAccountMonitoring',
    name: 'Loop semua brand DB (for const brand of brands)',
    ok: /for\s*\(\s*const\s+brand\s+of\s+brands\)/.test(loadTs),
  },
  {
    id: 'L02',
    area: 'loadAccountMonitoring',
    name: 'groupId pakai brandGroupId(brand.name, brand.id)',
    ok: loadTs.includes('brandGroupId(brand.name, brand.id)'),
  },
  {
    id: 'L03',
    area: 'loadAccountMonitoring',
    name: 'Dedupe grup by id setelah load',
    ok: loadTs.includes('byId') && loadTs.includes('rebuildGroupMetrics'),
  },
  {
    id: 'R01',
    area: 'removeBrandCompletely',
    name: 'deactivateMessagingAccount per akun sebelum hapus DB',
    ok: brandsTs.includes('deactivateMessagingAccount'),
  },
  {
    id: 'R02',
    area: 'removeBrandCompletely',
    name: 'Hapus chunk by account_id (skala banyak akun)',
    ok: brandsTs.includes('deleteRowsInAccountChunks'),
  },
  ...REMOVE_EXPLICIT.map(([sym, table, col]) => ({
    id: `R-${sym}`,
    area: 'removeBrandCompletely',
    name: `DELETE ${table} (${col})`,
    ok: brandsTs.includes(`TABLES.${sym}`) && brandsTs.includes('.delete()'),
  })),
  {
    id: 'R-CASCADE',
    area: 'removeBrandCompletely',
    name: 'platform_sessions/logs ikut hapus via DELETE messaging_accounts (schema CASCADE)',
    ok:
      brandsTs.includes('TABLES.messagingAccounts') &&
      RM_TABLES_ACCOUNT_CASCADE.every((t) =>
        read('supabase/migrations/017_rm_full_reset.sql').includes(t),
      ),
  },
  {
    id: 'E01',
    area: 'ensureBrand',
    name: 'ensureBrand: list semua brand user + match case-insensitive (tanpa filter is_active)',
    ok: (() => {
      const fn = brandsTs.slice(
        brandsTs.indexOf('export async function ensureBrand'),
        brandsTs.indexOf('export async function removeBrandCompletely'),
      );
      return (
        fn.includes(".eq('user_id', input.userId)") &&
        !fn.includes(".eq('is_active', true)") &&
        fn.includes('toLowerCase()')
      );
    })(),
  },
  {
    id: 'E02',
    area: 'ensureBrand',
    name: 'Revive brand is_active=false (hindari duplikat UNIQUE)',
    ok: brandsTs.includes('!existing.is_active'),
  },
  {
    id: 'UI01',
    area: 'UI',
    name: 'AccountBrandCardList panggil removeBrandCompletely + RemoveBrandModal',
    ok:
      cardListTs.includes('removeBrandCompletely') &&
      cardListTs.includes('RemoveBrandModal') &&
      cardListTs.includes('openRemoveBrandModal'),
  },
  {
    id: 'UI02',
    area: 'UI',
    name: 'Tidak ada dismissBrandGroup / dismissedBrandGroupIds',
    ok:
      !cardListTs.includes('dismissBrandGroup') &&
      !read('src/providers/GroupMonitoringProvider.tsx').includes('dismissedBrandGroupIds'),
  },
  {
    id: 'UI03',
    area: 'UI',
    name: 'Modal: Cancel merah (default), Delete sekunder',
    ok:
      modalTs.includes('brand-modal-header') &&
      modalTs.includes('sync-modal-message') &&
      modalTs.includes('cancelRef') &&
      modalTs.includes('brand-modal-btn--danger') &&
      modalTs.includes('brand-modal-btn--danger-muted') &&
      !modalTs.includes('removeBrandAccountsLine') &&
      !modalTs.includes('confirm-modal'),
  },
  ...removeBrandI18nKeys.map((key) => ({
    id: `I18N-${key}`,
    area: 'i18n',
    name: `en + zh punya groupMonitoring.${key}`,
    ok: enKeys[key] && zhKeys[key],
  })),
  {
    id: 'I18N-STYLE',
    area: 'i18n',
    name: 'en/zh: judul + data permanen (gaya caption contoh)',
    ok:
      read('src/i18n/locales/en.ts').includes('Delete this card?') &&
      read('src/i18n/locales/en.ts').includes('permanently deleted and cannot be recovered') &&
      read('src/i18n/locales/zh.ts').includes('确定删除此卡片') &&
      read('src/i18n/locales/zh.ts').includes('永久删除且无法恢复'),
  },
];

console.log('VALIDASI DETAIL — Brand card, filter, remove DB, modal\n');
console.log(
  'ID    | Area                  | Hasil | Pemeriksaan',
);
console.log('-'.repeat(95));

let failed = 0;
for (const c of checks) {
  const status = c.ok ? 'OK   ' : 'FAIL ';
  console.log(`${c.id.padEnd(5)} | ${c.area.padEnd(21)} | ${status} | ${c.name}`);
  if (!c.ok) failed += 1;
}

console.log('\n--- Simulasi filter (mock SBMY + WBSG) ---');
console.log(`Input grup: ${mockGroups.length}`);
console.log(
  `Output filter default: ${filteredDefault.length} → [${filteredDefault.map((g) => g.brandName).join(', ')}]`,
);
console.log(
  `SBMY accounts setelah filter: ${filteredDefault.find((g) => g.brandName === 'SBMY')?.accounts.length ?? 'MISSING'}`,
);

console.log('\n--- Urutan hapus DB (removeBrandCompletely) ---');
const steps = [
  '1. deactivateMessagingAccount (device WA/TG + DB session invalid)',
  '2. sync_activity_logs BY account_id',
  '3. scrape_runs BY account_id',
  '4. group_scrape_daily BY account_id',
  '5. group_scrape_daily BY brand (teks)',
  '6. groups_master BY brand (teks)',
  '7. account_snapshots BY brand_id',
  '8. messaging_accounts BY brand_id → CASCADE sessions + session_logs',
  '9. brands BY id',
];
for (const s of steps) console.log(s);

console.log(`\nTotal cek: ${checks.length} | Lulus: ${checks.length - failed} | Gagal: ${failed}`);

if (failed) {
  console.error('\nVALIDASI DETAIL GAGAL.');
  process.exit(1);
}
console.log('\nVALIDASI DETAIL LULUS.');
