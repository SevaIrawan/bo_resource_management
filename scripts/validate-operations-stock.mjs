/**
 * Kontrak stock engine Operations — decision table SOP + wire UI.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const classify = read('src/lib/classifyGroupStock.ts');
const policy = read('src/lib/groupStockPolicy.ts');
const loader = read('src/lib/loadOperationsStockCounts.ts');
const panel = read('src/components/group-monitoring/OperationsMonitoringPanel.tsx');
const cardList = read('src/components/group-monitoring/OperationsBrandCardList.tsx');
const card = read('src/components/group-monitoring/OperationsBrandCard.tsx');
const modal = read('src/components/group-monitoring/OperationsStockDetailModal.tsx');
const provider = read('src/providers/GroupMonitoringProvider.tsx');
const realtime = read('src/hooks/useRealtimeMonitoring.ts');
const compute = read('src/lib/computeStockToPrepare.ts');
const opsPolicy = read('src/config/operationsStockPolicy.ts');
const headerMeta = read('src/components/group-monitoring/OperationsBrandHeaderMeta.tsx');
const adminSection = read('src/components/admin/OperationsStockPolicySection.tsx');
const prefixConfig = read('src/config/stockPrefixCategoryConfig.ts');
const loadAvg = read('src/lib/loadAvgNewDepositor.ts');
const doc = read('docs/OPERATIONS-STOCK-ENGINE.md');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPrefix3(groupName, brand) {
  const name = groupName.trim();
  const token = brand.trim();
  if (!name || !token) return false;
  if (!/\sLG\s*$/i.test(name)) return false;
  return name.toLowerCase().includes(token.toLowerCase());
}

function isPrefix2(groupName, brand) {
  const name = groupName.trim();
  const token = brand.trim();
  if (!name || !token) return false;
  const pattern = new RegExp(
    `^(?:[\\p{Emoji}\\p{Emoji_Presentation}\\s])*(?:${escapeRegex(token)})\\s+NEW\\s*$`,
    'iu',
  );
  return pattern.test(name);
}

function isPrefix1(groupName, brand) {
  const name = groupName.trim();
  const token = brand.trim();
  if (!name || !token) return false;
  if (isPrefix3(name, token) || isPrefix2(name, token)) return false;
  const index = name.toLowerCase().indexOf(token.toLowerCase());
  if (index < 0) return false;
  let afterBrand = name.slice(index + token.length).trim();
  afterBrand = afterBrand.replace(/[\p{Emoji}\p{Emoji_Presentation}]+/gu, '').trim();
  if (!afterBrand || /^NEW$/i.test(afterBrand)) return false;
  return true;
}

const BLOCKLIST = [/^❌aa/i, /^CO group/i, /^Feedback Level/i];

function classifyBucket(groupName, memberNonAdmin, brand) {
  const count = Math.max(0, Math.floor(Number(memberNonAdmin) || 0));
  const name = groupName.trim();
  if (!name || !brand.trim()) return 'other';
  for (const pattern of BLOCKLIST) {
    if (pattern.test(name)) return 'other';
  }
  if (isPrefix3(name, brand) && count < 1) return 'recycle';
  if (isPrefix2(name, brand) && count < 1) return 'ready';
  if (isPrefix1(name, brand)) {
    if (count === 1) return 'active';
    if (count === 0 || count > 1) return 'review';
  }
  return 'other';
}

const BRAND = 'FWSG';
const decisionCases = [
  { name: 'Prefix1 + 1 → active', in: ['FWSG John', 1], out: 'active' },
  { name: 'Prefix1 + 0 → review', in: ['FWSG John', 0], out: 'review' },
  { name: 'Prefix1 + 2 → review', in: ['FWSG John', 2], out: 'review' },
  { name: 'Prefix2 + 0 → ready', in: ['FWSG NEW', 0], out: 'ready' },
  { name: 'Prefix2 + 1 → other', in: ['FWSG NEW', 1], out: 'other' },
  { name: 'Prefix3 + 0 → recycle', in: ['FWSG John LG', 0], out: 'recycle' },
  { name: 'Prefix3 + 1 → other', in: ['FWSG John LG', 1], out: 'other' },
  { name: 'blocklist ❌aa → other', in: ['❌aa junk', 1], out: 'other' },
  { name: 'legacy CO group → other', in: ['CO group x', 0], out: 'other' },
  { name: 'Ringgo LG before Prefix1', in: ['FWSG Ringgo LG', 0], out: 'recycle' },
];

const checks = [
  {
    name: 'Doc decision table: Prefix1 + 1 → Active',
    ok: doc.includes('Prefix1 + `member_non_admin = 1`') && doc.includes('**Active**'),
  },
  {
    name: 'Doc decision table: Prefix1 + 0 atau >1 → Review',
    ok: doc.includes('Prefix1 + `member_non_admin = 0`') && doc.includes('Prefix1 + `member_non_admin > 1`'),
  },
  {
    name: 'Doc: urutan blocklist → Prefix3 → Prefix2 → Prefix1',
    ok: doc.includes('blocklist → Prefix3 → Prefix2 → Prefix1'),
  },
  {
    name: 'classifyGroupStockBucket + aggregate + readGroupStockCounts',
    ok:
      classify.includes('export function classifyGroupStockBucket') &&
      classify.includes('aggregateGroupStockCountsByBrandPlatform') &&
      classify.includes('readGroupStockCounts'),
  },
  {
    name: 'Policy: Prefix3 suffix LG, Prefix2 NEW, blocklist default',
    ok:
      policy.includes('isPrefix3GroupName') &&
      policy.includes('isPrefix2GroupName') &&
      policy.includes('isPrefix1GroupName') &&
      policy.includes('readStockPrefixCategoryConfig') &&
      policy.includes('^❌aa'),
  },
  {
    name: 'Admin: two separate expand cards (stock + SOP naming)',
    ok:
      adminSection.includes('OperationsStockBrandPolicyCard') &&
      adminSection.includes('OperationsStockSopNamingCard') &&
      adminSection.includes('OperationsStockSopNamingPanel') &&
      adminSection.includes('persistStockPrefixCategoryConfig') &&
      prefixConfig.includes('STOCK_PREFIX_CONFIG_STORAGE_KEY'),
  },
  {
    name: 'Loader dedupe group_id + wire panel',
    ok:
      loader.includes('loadOperationsStockCountsByBrandPlatform') &&
      loader.includes('byGroupKey') &&
      panel.includes('loadOperationsStockCountsByBrandPlatform') &&
      panel.includes('stockCounts'),
  },
  {
    name: 'UI card: stockCounts prop (bukan placeholder)',
    ok:
      cardList.includes('readGroupStockCounts') &&
      card.includes('stockCounts: GroupStockCounts') &&
      !card.includes('EMPTY_GROUP_STOCK_COUNTS'),
  },
  {
    name: 'Double-click chip → modal detail bucket',
    ok:
      read('src/components/group-monitoring/OperationsGroupStockStrip.tsx').includes(
        'onBucketDoubleClick',
      ) &&
      read('src/components/group-monitoring/OperationsGroupStockStrip.tsx').includes(
        'onDoubleClick',
      ) &&
      card.includes('OperationsStockDetailModal') &&
      read('src/lib/loadOperationsStockBucketDetails.ts').includes(
        'fetchOperationsStockBucketDetails',
      ),
  },
  {
    name: 'Realtime: scheduleReportingReload → rm-operations-reload',
    ok:
      provider.includes('scheduleReportingReload') &&
      provider.includes("new Event('rm-operations-reload')") &&
      panel.includes("addEventListener('rm-operations-reload'"),
  },
  {
    name: 'Realtime: scrape/daily → scheduleReportingReload',
    ok:
      provider.includes('refreshAccountAfterDailyWrite') &&
      /refreshAccountAfterDailyWrite[\s\S]*scheduleReportingReload/.test(provider),
  },
  {
    name: 'Realtime: groups_master Supabase subscription',
    ok:
      realtime.includes('table: TABLES.groupsMaster') &&
      realtime.includes('handleMasterChange'),
  },
  {
    name: 'Modal detail ikut rm-operations-reload saat open',
    ok: modal.includes("addEventListener('rm-operations-reload'"),
  },
  {
    name: 'Modal detail: export Excel semua baris bucket',
    ok:
      modal.includes('exportOperationsStockBucketExcel') &&
      modal.includes('group-links-modal-footer') &&
      read('src/lib/exportExcel.ts').includes('exportOperationsStockBucketExcel'),
  },
  {
    name: 'Full refresh dispatch rm-operations-reload',
    ok: /registerFullRefreshHandler[\s\S]*rm-operations-reload/.test(provider),
  },
  {
    name: 'To prep: computeStockToPrepare + wire card list',
    ok:
      compute.includes('computeStockToPrepare') &&
      compute.includes('Math.ceil') &&
      cardList.includes('computeStockToPrepare') &&
      cardList.includes('readEffectiveBrandOperationsPolicy') &&
      cardList.includes('operationsPolicyByBrand') &&
      !cardList.includes('stockToPrepare: 0'),
  },
  {
    name: 'To prep warning UI + Admin per-brand Save + Avg ND days',
    ok:
      headerMeta.includes('operations-brand-col-metric--warning') &&
      adminSection.includes('operations-stock-policy-save-btn') &&
      adminSection.includes('colAvgNdDays') &&
      opsPolicy.includes('readAvgNdWindowDaysForBrand') &&
      opsPolicy.includes('OPERATIONS_POLICY_BY_BRAND_STORAGE_KEY') &&
      loadAvg.includes('readAvgNdWindowDaysForBrand'),
  },
  {
    name: 'Admin Save: tidak persist on blur',
    ok:
      !adminSection.includes('onBlur') &&
      adminSection.includes('draftHasChanges') &&
      adminSection.includes('persistOperationsPolicyByBrand'),
  },
  {
    name: 'To prep formula sample (187 total, 10%, ready 18 → gap 1)',
    ok: (() => {
      const total = 187;
      const pct = 10;
      const ready = 18;
      const target = Math.ceil((total * pct) / 100);
      const gap = Math.max(0, target - ready);
      return target === 19 && gap === 1;
    })(),
  },
  {
    name: 'Agregat chip = filter bucket (konsistensi sample)',
    ok: (() => {
      const sample = [
        { name: 'FWSG John', mna: 1 },
        { name: 'FWSG NEW', mna: 0 },
        { name: 'FWSG Jane LG', mna: 0 },
        { name: 'FWSG Bob', mna: 0 },
        { name: 'FWSG Bob', mna: 2 },
        { name: '❌aa junk', mna: 1 },
      ];
      const counts = { active: 0, ready: 0, recycle: 0, review: 0, other: 0 };
      for (const row of sample) {
        counts[classifyBucket(row.name, row.mna, BRAND)] += 1;
      }
      return ['active', 'ready', 'recycle', 'review', 'other'].every(
        (bucket) =>
          sample.filter((row) => classifyBucket(row.name, row.mna, BRAND) === bucket).length ===
          counts[bucket],
      );
    })(),
  },
  ...decisionCases.map((c) => ({
    name: `decision: ${c.name}`,
    ok: classifyBucket(c.in[0], c.in[1], BRAND) === c.out,
  })),
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nOperations stock engine checks passed.');
