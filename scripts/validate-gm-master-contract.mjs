/**
 * Audit statis kontrak cursor-prompt-gm-master.md
 * Jalankan: node scripts/validate-gm-master-contract.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const syncFlow = read('src/hooks/useAccountSyncFlow.ts');
const syncFlowService = read('src/services/syncFlowService.ts');
const scrapeFlow = read('src/services/scrapeFlowService.ts');
const accountScraper = read('src/lib/accountScraper.ts');
const brandUtils = read('src/lib/accountBrandUtils.ts');
const guard = read('electron/main/automation/jobQueueGuard.ts');
const slotPool = read('electron/main/automation/executeSlotPool.ts');
const cells = read('src/components/group-monitoring/AccountMonitoringCells.tsx');
const migration035 = read('supabase/migrations/035_rm_fix_master_pk_and_scrape_commit.sql');
const migration036 = read('supabase/migrations/036_rm_master_pk_brand_platform_group_id.sql');
const migration038 = read('supabase/migrations/038_rm_master_require_brand_admin.sql');
const migration040 = read('supabase/migrations/040_rm_master_admin_invite_cross_row.sql');

const checks = [
  {
    name: '§4 Atomik daily+master via rm_commit_account_scrape',
    ok:
      accountScraper.includes("rpc('rm_commit_account_scrape'") &&
      migration035.includes('DELETE FROM public.resource_management_group_scrape_daily') &&
      migration036.includes('DELETE FROM public.resource_management_groups_master'),
  },
  {
    name: '§4 Master PK = (brand, platform, group_id) + dedupe picked + advisory lock',
    ok:
      migration036.includes('ADD PRIMARY KEY (brand, platform, group_id)') &&
      migration036.includes('DISTINCT ON (group_id)') &&
      migration036.includes('rm_build_master_row_id(v_brand, p_platform, group_id)') &&
      migration036.includes('pg_advisory_xact_lock'),
  },
  {
    name: '§4 Master gate: ≥1 admin AND ≥1 invite valid (boleh beda baris) — 040',
    ok:
      migration040.includes('bool_or(lower(trim(coalesce(is_admin, \'\'))) = \'yes\')') &&
      migration040.includes('bool_or(public.rm_invite_link_is_valid(p_platform, invite_link))') &&
      migration040.includes('invite_picked') &&
      migration040.includes('meta_picked') &&
      migration040.includes('eligible') &&
      migration040.includes("p_platform NOT IN ('whatsapp', 'telegram')") &&
      (migration040.match(/bool_or\(lower\(trim\(coalesce\(is_admin/g) || []).length >= 2 &&
      (migration040.match(/CREATE OR REPLACE FUNCTION public\.rm_commit_account_scrape/g) || []).length >= 1 &&
      (migration040.match(/CREATE OR REPLACE FUNCTION public\.rm_rebuild_brand_groups_master/g) || []).length >= 1,
  },
  {
    name: '§4 Legacy 038 still documents brand-admin intent (superseded by 040 cross-row)',
    ok:
      migration038.includes('WhatsApp DAN Telegram') &&
      migration038.includes("lower(trim(coalesce(is_admin, ''))) = 'yes'"),
  },
  {
    name: '§3 Later / sync valid = sessionOnly (grid metrik tidak berubah)',
    ok:
      syncFlow.includes('sessionOnly: true') &&
      brandUtils.includes('sessionOnly?: boolean'),
  },
  {
    name: '§3 Sync valid TIDAK panggil detectGroups (no double device read)',
    ok: !/detectGroupsAndBuildSyncPayload/.test(
      syncFlowService.slice(
        syncFlowService.indexOf('export async function executeSyncCheck'),
        syncFlowService.indexOf('export async function recordSyncCheckActivity'),
      ),
    ),
  },
  {
    name: '§5 Grid scrape sukses via applyResult (bukan onAccountGridRefresh)',
    ok:
      syncFlow.includes("outcome.kind === 'success'") &&
      syncFlow.includes('applyResult(groupId, account.id, outcome.result') &&
      !/await onAccountGridRefresh\?\.\(/.test(syncFlow),
  },
  {
    name: '§ Run valid: updateSessionOnSuccess false',
    ok:
      syncFlow.includes('updateSessionOnSuccess: false') &&
      scrapeFlow.includes('updateSessionOnSuccess?: boolean'),
  },
  {
    name: '§ Multi-akun: executeSlotPool per platform (WA/TG) + IPC',
    ok:
      slotPool.includes('getMaxWaBrowserSlots') &&
      slotPool.includes('getMaxTgExecuteSlots') &&
      read('electron/preload/index.ts').includes('executeSlots:'),
  },
  {
    name: '§ Guard IPC tidak blok slot sendiri (no isExecuteSlotActiveForAccount)',
    ok: !guard.includes('isExecuteSlotActiveForAccount') && !guard.includes('areAllExecuteSlotsFull'),
  },
  {
    name: '§ Scrape error: defer slot sampai modal ditutup',
    ok:
      syncFlow.includes('deferSlotRelease = true') &&
      syncFlow.includes('releaseExecuteSlot(target.account.id)'),
  },
  {
    name: '§ Kolom Last update read-only (tanpa tombol Run)',
    ok:
      cells.includes('LastUpdateColumnCell') &&
      !cells.includes('canRunScraper') &&
      cells.includes('useSyncToLogin'),
  },
  {
    name: '§ Job queue isolasi per akun (bukan global block)',
    ok: read('src/lib/automationJobQueueClient.ts').includes('isAccountJobActive'),
  },
  {
    name: '§ User WA scrape tanpa freshBoot; auto lane boleh freshBoot+pool terpisah',
    ok: (() => {
      const wa = read('electron/main/scraper/whatsappScrape.ts');
      const userLane = wa.slice(0, wa.indexOf('runWhatsAppScrapeAutoLane'));
      return (
        !userLane.includes('freshBoot: true') &&
        wa.includes('runWhatsAppScrapeAutoLane') &&
        wa.includes("browserPool: 'auto'")
      );
    })(),
  },
  {
    name: '§ WA scrape: absent membership (bukan silent / bukan fake skip incomplete)',
    ok:
      read('electron/main/scraper/whatsappScrape.ts').includes('absent (not on account)') &&
      read('electron/main/scraper/whatsappScrape.ts').includes('absentFromAccount') &&
      read('electron/main/scraper/whatsappScrape.ts').includes('realGroupCount'),
  },
  {
    name: '§ WA discovery: hanya grup masih member (bukan semua @g.us ghost)',
    ok:
      read('electron/main/scraper/whatsappGroupDiscovery.ts').includes(
        'listLiveWhatsAppGroupIdsFromStore',
      ) &&
      read('electron/main/scraper/whatsappGroupDiscovery.ts').includes('meInGroup'),
  },
];

let failed = 0;
console.log('--- GM Master Contract (cursor-prompt-gm-master.md) ---');
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} contract check(s) failed`);
  process.exit(1);
}
console.log('\nGM master contract static checks passed.');
