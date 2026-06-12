/**
 * Audit fakta di docs/PROJECT-MASTER-REFERENCE.md terhadap repo saat ini.
 * Jalankan: node scripts/audit-project-master-reference.mjs
 * Gagal = doc atau kode drift — perbaiki doc ATAU kode, jangan asumsi.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  return false;
}

function ok(msg) {
  console.log(`OK    ${msg}`);
  return true;
}

const checks = [];
let failed = 0;

function check(name, fn) {
  try {
    if (!fn()) failed += 1;
  } catch (e) {
    failed += 1;
    console.error(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

const pkg = JSON.parse(read('package.json'));
check('package.json version', () => {
  if (pkg.version !== '1.0.16') return fail(`version=${pkg.version}, doc claims 1.0.16 — update doc or version`);
  return ok(`version ${pkg.version}`);
});

check('multi-platform installer scripts', () => {
  const s = pkg.scripts;
  if (!s['build:installer:win'] || !s['build:installer:mac'] || !s['build:installer:linux']) {
    return fail('missing build:installer:win|mac|linux');
  }
  if (!pkg.build?.mac?.target || !pkg.build?.linux?.target) {
    return fail('package.json build.mac/linux missing');
  }
  return ok('build:installer win/mac/linux + electron-builder targets');
});

check('CI release-multiplatform workflow', () =>
  fs.existsSync(path.join(root, '.github/workflows/release-multiplatform.yml'))
    ? ok('release-multiplatform.yml exists')
    : fail('release-multiplatform.yml missing'),
);

check('DEFAULT_EMPTY_SLOT_COUNT = 3', () => {
  const t = read('src/lib/accountBrandUtils.ts');
  return /DEFAULT_EMPTY_SLOT_COUNT = 3/.test(t)
    ? ok('DEFAULT_EMPTY_SLOT_COUNT = 3')
    : fail('DEFAULT_EMPTY_SLOT_COUNT not 3');
});

check('grid 9 columns', () => {
  const t = read('src/components/group-monitoring/AccountMonitoringTableParts.tsx');
  return /ACCOUNT_TABLE_COLUMN_COUNT = 9/.test(t)
    ? ok('ACCOUNT_TABLE_COLUMN_COUNT = 9')
    : fail('column count not 9');
});

check('clear session module', () => {
  const t = read('src/lib/clearAccountSession.ts');
  if (!t.includes('CLEAR_SESSION_REASON')) return fail('CLEAR_SESSION_REASON missing');
  if (!t.includes('invalidatePlatformSessionEverywhere')) return fail('clear session must invalidate DB');
  return ok('clearAccountSession.ts present');
});

check('accountActionColumn resolver', () => {
  const t = read('src/lib/accountActionColumn.ts');
  if (!t.includes('resolveAccountActionColumn')) return fail('missing resolveAccountActionColumn');
  if (!t.includes("row.actionProcess === 'scraper'")) return fail('cancel-run condition missing');
  if (!t.includes("row.actionProcess === 'sync'")) return fail('proc-sync condition missing');
  if (!t.includes("row.actionProcess === 'session_check'")) return fail('session_check proc condition missing');
  if (t.includes('accountNeedsRelogin')) return fail('Action must not gate on relogin');
  if (t.includes('adminCurrent')) return fail('Action must not gate on admin — use Y>0 && X>0');
  if (!t.includes('accountHasGroupLinkData')) return fail('accountHasGroupLinkData helper missing');
  if (!/y > 0 && x > 0/.test(t)) return fail('group-link gate Y>0 && X>0 missing');
  if (!/return 'group-link'/.test(t)) return fail('group-link branch missing');
  if (!/return 'none'/.test(t)) return fail('idle fallback to none missing');
  if (!t.includes('Number.isFinite')) return fail('group-link gate must reject non-finite Y/X');
  return ok('accountActionColumn.ts logic present');
});

check('showLoginModal does not set session_check on Session column', () => {
  const t = read('src/hooks/useAccountSyncFlow.ts');
  const fn = t.slice(t.indexOf('const showLoginModal'), t.indexOf('const showSyncError'));
  if (/setRowProcessing/.test(fn)) return fail('showLoginModal still calls setRowProcessing');
  return ok('showLoginModal: no setRowProcessing');
});

check('INVALID sync → Action proc-sync (not session_check marquee)', () => {
  const t = read('src/hooks/useAccountSyncFlow.ts');
  return /opensLogin \? 'sync' : 'session_check'/.test(t)
    ? ok('runSyncCheck: sync on INVALID, session_check on VALID')
    : fail('runSyncCheck opensLogin ternary missing');
});

check('login modal keeps proc-sync until close', () => {
  const t = read('src/hooks/useAccountSyncFlow.ts');
  return /outcome\.kind === 'login'[\s\S]*patchRowProcessAction[\s\S]*'sync'/.test(t)
    ? ok('login outcome keeps actionProcess sync')
    : fail('login outcome should patchRowProcessAction sync');
});

check('runScrape defers finally clear when login modal opens', () => {
  const t = read('src/hooks/useAccountSyncFlow.ts');
  const block = t.slice(t.indexOf('const runScrapeInBackground'), t.indexOf('const confirmScrapePrompt'));
  return /holdRowStateForLogin/.test(block) && /if \(!holdRowStateForLogin\)/.test(block)
    ? ok('runScrapeInBackground: holdRowStateForLogin')
    : fail('runScrape finally still clears on login');
});

check('prepareDevice purge only on device_dead or FORCE_SCRAPER', () => {
  const t = read('src/lib/prepareDeviceForLogin.ts');
  return t.includes('shouldPurgeWaDiskForLogin') &&
    t.includes("purgeHint === 'device_dead'") &&
    !/purgeWaDisk:\s*input\.account\.platform === 'whatsapp'/.test(t)
    ? ok('prepareDeviceForLogin: conditional purge')
    : fail('prepareDevice still always purges WA disk');
});

check('accountGroupEstimate uses real metrics not floor 500', () => {
  const t = read('src/config/syncScraperPolicy.ts');
  return !t.includes('accountGroupEstimateFloor') &&
    /Math\.max\(y, x\)/.test(t)
    ? ok('syncScraperPolicy: real group estimate')
    : fail('floor 500 still present');
});

check('session check fixed 3s not group-scaled', () => {
  const policy = read('src/config/syncScraperPolicy.ts');
  const gate = read('src/lib/deviceSessionGate.ts');
  const validate = read('electron/main/scraper/validateSession.ts');
  if (!policy.includes('sessionCheck') || !policy.includes('timeoutMs: 3_000')) {
    return fail('sessionCheck timeout missing in policy');
  }
  if (!gate.includes('sessionCheckTimeoutMs')) return fail('gate must use sessionCheckTimeoutMs');
  if (gate.includes('probeThenWarm') || gate.includes('groupEstimate')) {
    return fail('session gate still warm or group-scaled');
  }
  if (validate.includes('withWhatsAppClient') || validate.includes('waitForWhatsAppStoreReady')) {
    return fail('validate must not use scrape-level WA client');
  }
  if (!validate.includes('probeWhatsAppSessionLinked')) {
    return fail('WA session probe must use probeWhatsAppSessionLinked');
  }
  const wa = read('electron/main/platformLogin/whatsapp.ts');
  if (wa.includes('waitForWhatsAppStoreReady') && /probeWhatsAppSessionLinkedInner/.test(wa)) {
    const probeBlock = wa.slice(wa.indexOf('probeWhatsAppSessionLinkedInner'), wa.indexOf('export function getWhatsAppSessionClient'));
    if (probeBlock.includes('waitForWhatsAppStoreReady')) {
      return fail('session probe must not wait for WA store');
    }
  }
  if (!read('electron/main/scraper/deviceGroupScale.ts').includes('SESSION_CHECK_TIMEOUT_MS = 3_000')) {
    return fail('SESSION_CHECK_TIMEOUT_MS missing');
  }
  return ok('session check: 3s getState probe, no group read');
});

check('scraper cancel IPC', () => {
  const main = read('electron/main/scraper/index.ts');
  const preload = read('electron/preload/index.ts');
  if (!main.includes("'scraper:cancel'")) return fail('scraper:cancel missing in main');
  if (!preload.includes("'scraper:cancel'")) return fail('scraper:cancel missing in preload');
  if (!fs.existsSync(path.join(root, 'electron/main/scraper/scrapeCancel.ts'))) {
    return fail('scrapeCancel.ts missing');
  }
  return ok('scraper:cancel wired');
});

check('sidecar port 8765', () => {
  const t = read('electron/main/platformLogin/telegramSidecar.ts');
  return t.includes('8765') ? ok('SIDECAR port 8765') : fail('sidecar port not 8765');
});

check('sidecar scrape cancel endpoint', () => {
  const t = read('python-sidecar/main.py');
  return t.includes('/telegram/scrape/cancel/{session_id}')
    ? ok('POST /telegram/scrape/cancel/{session_id}')
    : fail('scrape cancel endpoint missing in main.py');
});

check('TG login QR endpoint (not /qr/{id})', () => {
  const t = read('python-sidecar/main.py');
  if (t.includes('/telegram/login/qr/{')) return fail('doc wrong: no GET /telegram/login/qr/{id}');
  return /\/telegram\/login\/qr\/start/.test(t)
    ? ok('POST /telegram/login/qr/start')
    : fail('qr/start endpoint missing');
});

check('TicketType enum', () => {
  const t = read('src/types/database.ts');
  for (const type of [
    'missing_group',
    'not_admin',
    'duplicate_group_id',
    'duplicate_group_name',
    'daily_junk_group',
  ]) {
    if (!t.includes(`'${type}'`)) return fail(`TicketType ${type} missing`);
  }
  return ok('TicketType values in database.ts');
});

check('accountNeedsRelogin', () => {
  const t = read('src/lib/platformSyncCopy.ts');
  return /sessionStatus === 'invalid' \|\| account\.status === 'logout'/.test(t)
    ? ok('accountNeedsRelogin = invalid session OR logout status')
    : fail('accountNeedsRelogin pattern changed');
});

check('permissions admin-only operate', () => {
  const t = read('src/lib/userRole.ts');
  return /canOperatePlatform: isAdmin/.test(t)
    ? ok('canOperatePlatform: admin only')
    : fail('canOperatePlatform logic changed');
});

check('tables.ts RM tables', () => {
  const t = read('src/config/tables.ts');
  const expected = [
    'resource_management_brands',
    'resource_management_messaging_accounts',
    'resource_management_platform_sessions',
    'resource_management_group_scrape_daily',
    'resource_management_tickets',
  ];
  for (const table of expected) {
    if (!t.includes(table)) return fail(`tables.ts missing ${table}`);
  }
  return ok('TABLES constants present');
});

check('logic_sync_scraper.txt exists', () =>
  fs.existsSync(path.join(root, 'logic_sync_scraper.txt'))
    ? ok('logic_sync_scraper.txt')
    : fail('logic_sync_scraper.txt missing'),
);

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`} — audit-project-master-reference`);
if (failed) process.exit(1);
