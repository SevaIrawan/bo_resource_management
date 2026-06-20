/**
 * Validasi: session/scrape/sync pakai UUID baris grid — bukan aliasing label global.
 * Jalankan: node scripts/validate-session-account-resolve.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const resolveSrc = read('src/lib/accountSessionResolve.ts');
const gateSrc = read('src/lib/userActionSession.ts');
const scraperSrc = read('src/lib/runAccountScraper.ts');
const scraperPolicy = read('src/lib/accountScraper.ts');
const cacheSrc = read('src/lib/masterDailyLoadCache.ts');

const checks = [
  {
    name: 'resolveDbAccountForRow prioritizes row_id (account.id)',
    ok: resolveSrc.includes("matchedBy: 'row_id'") && resolveSrc.includes('messagingAccountBelongsToUser'),
  },
  {
    name: 'resolveDbAccountForRow does NOT label_session hijack',
    ok: !resolveSrc.includes("matchedBy: 'label_session'") && !resolveSrc.includes('byLabelSession'),
  },
  {
    name: 'findMessagingAccountWithActiveSession filters user_id',
    ok: resolveSrc.includes(".eq('user_id', userId)"),
  },
  {
    name: 'checkUserActionDeviceSession warms device before probe',
    ok: gateSrc.includes('warmSessionIfStored') && gateSrc.includes('readLatestSessionUiStatus'),
  },
  {
    name: 'device gate uses shouldInvalidate only for dead session',
    ok: read('src/lib/deviceSessionGate.ts').includes('shouldInvalidate: dead'),
  },
  {
    name: 'runAccountScraper accepts dbAccountId passthrough',
    ok: scraperSrc.includes('dbAccountId?: string') && scraperSrc.includes('input.dbAccountId'),
  },
  {
    name: 'writeScrapeDailyRows DELETE daily by account_id before INSERT',
    ok: scraperPolicy.includes(".delete()") && scraperPolicy.includes(".eq('account_id', input.accountId)"),
  },
  {
    name: 'writeScrapeDailyRows rebuild master + invalidate cache',
    ok:
      scraperPolicy.includes('rebuildBrandGroupsMaster') &&
      scraperPolicy.includes('invalidateMasterDailyCacheForScrape'),
  },
  {
    name: 'masterDailyLoadCache invalidate after scrape',
    ok: cacheSrc.includes('invalidateMasterDailyCacheForScrape'),
  },
  {
    name: 'sessionAvailability no global label session lookup',
    ok: !read('src/lib/sessionAvailability.ts').includes('findMessagingAccountWithActiveSession'),
  },
  {
    name: 'WA probe: null getState treated as loading (not unlinked)',
    ok: read('electron/main/scraper/whatsappLinkState.ts').includes("if (!state) return 'loading'"),
  },
  {
    name: 'Sync skip device probe during session grace',
    ok: read('src/services/syncFlowService.ts').includes('isAccountInSessionGrace(account.id)'),
  },
  {
    name: 'Grid patch after scrape: dbAccountId + uiAccountId lookup',
    ok:
      read('src/lib/patchAccountGridAfterDailyWrite.ts').includes('uiAccountId') &&
      read('src/providers/GroupMonitoringProvider.tsx').includes('refreshAccountAfterDailyWrite(dbAccountId, uiAccountId)'),
  },
];

let failed = 0;
for (const c of checks) {
  if (c.ok) {
    console.log(`OK  ${c.name}`);
  } else {
    console.error(`FAIL ${c.name}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log('\nAll session account resolve checks passed.');
