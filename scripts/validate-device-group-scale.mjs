/**
 * Skala hingga 6000 grup (store cap): idle watchdog, abort on stale, 4 akun paralel.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const scaleElectron = read('electron/main/scraper/deviceGroupScale.ts');
const scalePolicy = read('src/config/syncScraperPolicy.ts');
const loginFlow = read('src/services/loginFlowService.ts');
const loginHook = read('src/hooks/useAccountSyncFlow.ts');
const syncFlow = read('src/services/syncFlowService.ts');
const gateSrc = read('src/lib/deviceSessionGate.ts');
const waLogin = read('electron/main/platformLogin/whatsapp.ts');
const validateSession = read('electron/main/scraper/validateSession.ts');
const waScrape = read('electron/main/scraper/whatsappScrape.ts');
const tgPy = read('python-sidecar/telegram_scraper.py');
const tgScrape = read('electron/main/scraper/telegramScrape.ts');
const watchdog = read('electron/main/scraper/scrapeWatchdog.ts');
const scrapeProgress = read('electron/main/scraper/scrapeProgress.ts');
const scraperIdx = read('electron/main/scraper/index.ts');
const sidecarMain = read('python-sidecar/main.py');
const autoScrape = read('src/lib/runAutoAccountScrape.ts');

/** Handler cancel-auto saja — cancel sidecar tidak boleh bocor ke lane manual. */
const cancelAutoBody = scraperIdx.slice(
  scraperIdx.indexOf("'scraper:cancel-auto'"),
  scraperIdx.indexOf("'scraper:auto-lane-ready'"),
);
const cancelAutoActiveBranch = cancelAutoBody.slice(
  cancelAutoBody.indexOf('if (wasActive) {'),
  cancelAutoBody.indexOf('} else if'),
);

const executeSyncCheckBody = syncFlow.slice(
  syncFlow.indexOf('export async function executeSyncCheck'),
  syncFlow.indexOf('export async function recordSyncCheckActivity'),
);

const checks = [
  {
    name: 'TG scrape: shell migrate tidak masuk targets (1 grup 1 ID Super Group saja)',
    ok: (() => {
      const resolveMember = tgPy.match(
        /async def _resolve_member_count[\s\S]*?(?=\n(?:async )?def )/,
      );
      return (
        tgPy.includes('_is_live_group_dialog') &&
        tgPy.includes('skipped_migrate') &&
        tgPy.includes('Shell basic setelah migrate') &&
        tgPy.includes('_upgrade_basic_chat_if_migrated') &&
        tgPy.includes('_ingest_migrated_from_chat_ids') &&
        tgPy.includes('_prune_migrated_shells_from_dialogs') &&
        tgPy.includes('migrated_from_chat_id') &&
        // Jangan tulis Chat yang masih punya migrated_to.
        tgPy.includes('isinstance(entity, Chat) and getattr(entity, "migrated_to", None) is not None') &&
        // migrated_from hanya untuk SKIP shell di discovery — bukan konversi di _resolve_member_count.
        !tgPy.includes('_basic_chat_peer_id') &&
        Boolean(resolveMember) &&
        !resolveMember[0].includes('migrated_from_chat_id')
      );
    })(),
  },
  {
    name: 'TG scrape: is_admin dari flags dialog + GetParticipant; mass unverified jangan commit',
    ok:
      tgPy.includes('_roles_from_channel_entity') &&
      tgPy.includes('GetParticipantRequest') &&
      tgPy.includes('admin_rights') &&
      tgPy.includes('SCRAPER_UNVERIFIED_ROLES') &&
      tgPy.includes('group_roles_retry') &&
      tgPy.includes('verified'),
  },
  {
    name: 'TG scrape: discovery putus → error (jangan commit daily bolong)',
    ok:
      tgPy.includes('class DiscoveryIncomplete') &&
      tgPy.includes('SCRAPER_DISCOVERY_FLOODWAIT') &&
      tgPy.includes('SCRAPER_DISCOVERY_FAILED') &&
      /except FloodWaitError as exc:[\s\S]*?continue/.test(tgPy),
  },
  {
    name: 'TG scrape: GetDialogs pagination sendiri (bukan iter_dialogs — buffer kosong putus)',
    ok:
      tgPy.includes('_load_all_group_dialogs') &&
      tgPy.includes('GetDialogsRequest') &&
      !tgPy.includes('async for dialog in client.iter_dialogs(') &&
      !/iter_dialogs\([^)]*ignore_migrated\s*=\s*True/.test(tgPy) &&
      !tgPy.includes('_resolve_live_group_entity') &&
      !tgPy.includes('_resolve_migrated_channel') &&
      tgPy.includes('seen_peer_ids'),
  },
  {
    name: 'TG scrape: basic group terhapus (deactivated) tidak ditulis ke daily',
    ok: /isinstance\(entity, Chat\) and getattr\(entity, "deactivated", False\)/.test(tgPy),
  },
  {
    name: 'TG scrape: dialog left=True (sudah leave/kick) tidak ditulis ke daily (anti Junk stale)',
    ok:
      /def _is_live_group_dialog[\s\S]*?getattr\(entity, "left", False\)/.test(tgPy) &&
      tgPy.includes('cache server belum sinkron'),
  },
  {
    name: 'TG scrape: gagal resolve 1 peer discovery = retry lalu DiscoveryIncomplete (bukan diam skip)',
    ok:
      tgPy.includes('async def _resolve_dialog_peer_with_retry') &&
      tgPy.includes('entity = await _resolve_dialog_peer_with_retry(client, raw.peer, session_id)') &&
      // Loop utama TIDAK boleh lagi diam-diam `continue` saat get_entity gagal (hilang permanen).
      !/entity = entities\.get\(peer_id\)\s*\n\s*if entity is None:\s*\n\s*try:\s*\n\s*entity = await client\.get_entity\(raw\.peer\)[\s\S]{0,80}except Exception:[\s\S]{0,40}continue/.test(
        tgPy,
      ) &&
      /_resolve_dialog_peer_with_retry\(client, raw\.peer, session_id\)[\s\S]{0,400}raise DiscoveryIncomplete/.test(
        tgPy,
      ),
  },
  {
    name: 'TG scrape: chunk penuh 0 peer baru = cursor macet → DiscoveryIncomplete (bukan silent break)',
    ok:
      /if new_peers == 0:[\s\S]{0,800}raise DiscoveryIncomplete\(\s*\n\s*"SCRAPER_DISCOVERY_STALLED/.test(
        tgPy,
      ),
  },
  {
    name: 'TG scrape: invite link DIBACA dulu, ExportChatInvite (membuat link baru) jalan terakhir',
    ok:
      tgPy.includes('GetExportedChatInvitesRequest') &&
      tgPy.includes('_read_own_exported_invite') &&
      // Urutan wajib: existing_invite (GetFull) → link lama akun → baru boleh export.
      tgPy.indexOf('_read_own_exported_invite(client, entity)') <
        tgPy.indexOf('ExportChatInviteRequest(peer=entity)'),
  },
  {
    name: 'Grup TIDAK dibuang karena member_count 0 (0 juga berarti API gagal → missing_group palsu)',
    ok:
      !/member_count\s*or\s*0\)\s*<=\s*0/.test(tgPy) &&
      !/member_count\s*\|\|\s*0\)\s*<=\s*0/.test(read('src/lib/dedupeScrapedGroups.ts')),
  },
  {
    name: 'TG scrape: checkpoint parsial tidak boleh commit daily (rm_commit menghapus daily akun)',
    ok:
      tgScrape.includes('SCRAPER_PARTIAL_RESULT') &&
      tgScrape.includes('.partial === true') &&
      tgPy.includes('PARTIAL_BEFORE_CANCEL') &&
      !tgPy.includes('agar Electron bisa commit'),
  },
  {
    name: 'Teardown auto lane idle tidak cancel sidecar (jangan patahkan scrape manual akun sama)',
    ok:
      cancelAutoActiveBranch.includes('cancelTelegramScrape') &&
      cancelAutoBody.split('cancelTelegramScrape').length - 1 === 1,
  },
  {
    name: 'Sidecar cancel no-op tanpa scrape jalan (flag sticky tidak bunuh scrape berikutnya)',
    ok:
      sidecarMain.includes('if not is_telegram_scrape_running(session_id):') &&
      sidecarMain.includes('NO_ACTIVE_SCRAPE'),
  },
  {
    name: 'Idle stuck tidak disamarkan jadi SCRAPER_CANCELLED',
    ok:
      scraperIdx.includes("import { ScrapeTimeoutError } from './deviceGroupScale'") &&
      scraperIdx.split('if (error instanceof ScrapeTimeoutError) throw error;').length - 1 === 2,
  },
  {
    name: 'Auto scrape mengalah ke lane yang duluan jalan → remark busy (bukan session_invalid)',
    ok:
      autoScrape.includes("Promise<AutoScrapeReadiness>") &&
      autoScrape.includes("return 'busy'") &&
      autoScrape.includes("readiness === 'busy' ? 'busy' : 'skipped'") &&
      read('src/hooks/useAutoAccountSync.ts').includes("if (result === 'busy') return 'busy';"),
  },
  {
    name: 'Store cap 6000 grup (electron)',
    ok:
      scaleElectron.includes('WA_STORE_GROUP_LIST_CAP = 6000') &&
      scaleElectron.includes('DEVICE_GROUP_TARGET_MAX = WA_STORE_GROUP_LIST_CAP'),
  },
  {
    name: 'Store cap 6000 grup (policy + telegram sidecar)',
    ok:
      scalePolicy.includes('deviceGroupTargetMax: 6000') &&
      tgPy.includes('DEVICE_GROUP_TARGET_MAX = 6000'),
  },
  {
    name: 'Tidak ada wall-clock scrape tetap (3600s / SCRAPE_MAX_MS)',
    ok:
      !scaleElectron.includes('const SCRAPE_MAX_MS') &&
      !scaleElectron.includes('3_600_000') &&
      !waScrape.includes('withScrapeTimeout'),
  },
  {
    name: 'Idle watchdog saja + abort on stale',
    ok:
      watchdog.includes('no progress for') &&
      !watchdog.includes('maxTimer') &&
      !watchdog.includes('setScrapeWatchdogBudget') &&
      waScrape.includes("onStale: (sid) => abortActiveScrape(sid, 'whatsapp')"),
  },
  {
    name: 'Progress touch watchdog (UI + per grup)',
    ok:
      scrapeProgress.includes('touchScrapeWatchdog(payload.sessionId)') &&
      waScrape.includes('touchScrapeWatchdog(input.sessionId)'),
  },
  {
    name: 'Watchdog WA dimulai setelah client terbuka (bukan sebelum pool)',
    ok:
      waScrape.includes('withWhatsAppClient') &&
      /withWhatsAppClient[\s\S]{0,200}withScrapeWatchdog/.test(waScrape),
  },
  {
    name: 'Dua fase WA: metadata paralel + invite serial',
    ok:
      waScrape.includes('runPooled') &&
      waScrape.includes('waInviteExportDelayMs') &&
      !/runPooled[\s\S]{0,400}fetchWhatsAppGroupInviteLink/.test(waScrape),
  },
  {
    name: 'Estimasi plan dari count device (log only)',
    ok:
      scaleElectron.includes('scrapeTotalPlanMs') &&
      scaleElectron.includes('scrapeInvitePhaseBudgetMs') &&
      scaleElectron.includes('formatScrapeEtaLabel') &&
      (waScrape.includes('scrapeTotalPlanMs(total, adminRows.length)') ||
        waScrape.includes('scrapeTotalPlanMs(total, adminNeedInvite.length)')),
  },
  {
    name: 'TG progress poll hanya emit jika fingerprint berubah',
    ok: tgScrape.includes('lastFingerprint') && tgScrape.includes('json.seq'),
  },
  {
    name: 'WA inbox stable: count 0 bukan sukses (anti SCRAPER_NO_GROUPS palsu)',
    ok:
      read('electron/main/scraper/whatsappGroupDiscovery.ts').includes(
        'count >= minGroups && count === lastCount',
      ) &&
      read('electron/main/scraper/whatsappGroupDiscovery.ts').includes('minGroups') &&
      read('electron/main/scraper/whatsappGroupDiscovery.ts').includes('@g.us') &&
      read('electron/main/scraper/whatsappGroupDiscovery.ts').includes('peakCount') &&
      scaleElectron.includes('waInboxStableRounds') &&
      waScrape.includes('waInboxStableRounds') &&
      waScrape.includes('syncedCount') &&
      !read('electron/main/scraper/whatsappScrapeQuality.ts').includes('tidak mengembalikan') &&
      read('electron/main/scraper/whatsappScrapeQuality.ts').includes("throw new Error('SCRAPER_NO_GROUPS')"),
  },
  {
    name: 'WA auto = manual scrape body (shared opts + inbox scale 5k)',
    ok:
      waScrape.includes('waScrapeSharedClientOpts') &&
      waScrape.includes('scaleEstimate') &&
      waScrape.includes('runWhatsAppScrapeAutoLane') &&
      /runWhatsAppScrapeAutoLane[\s\S]*?waScrapeSharedClientOpts/.test(waScrape) &&
      /runWhatsAppScrape\([\s\S]*?waScrapeSharedClientOpts/.test(waScrape),
  },
  {
    name: 'WA scrape checkpoint resume + incomplete store fails clearly',
    ok:
      waScrape.includes('loadScrapeCheckpoint') &&
      waScrape.includes('clearScrapeCheckpoint') &&
      waScrape.includes('SCRAPER_INCOMPLETE'),
  },
  {
    name: 'TG idle watchdog + cancel sidecar on stale',
    ok:
      tgScrape.includes('withScrapeWatchdog') &&
      tgScrape.includes('cancelTelegramScrape(sid)') &&
      !tgScrape.includes('AbortSignal.timeout(scrapeGroupsTimeoutMs'),
  },
  {
    name: 'TG scrape progress poll',
    ok:
      tgScrape.includes('/telegram/scrape/progress/') &&
      tgPy.includes('get_scrape_progress'),
  },
  {
    name: 'TG scrape async job + result poll (bukan POST panjang)',
    ok:
      tgScrape.includes('/telegram/scrape/result/') &&
      tgScrape.includes("'started'") &&
      !tgScrape.includes("withNetworkRetry('Telegram scrape'") &&
      tgPy.includes('start_telegram_scrape_job') &&
      read('python-sidecar/main.py').includes('/telegram/scrape/result/') &&
      /SIDECAR_VERSION\s*=\s*\d+/.test(
        read('electron/main/platformLogin/telegramSidecar.ts'),
      ),
  },
  {
    name: 'TG finishing: serialize-first export + soft-fail setelah write DB',
    ok:
      read('python-sidecar/telegram_login.py').includes('_ensure_client_connected') &&
      read('python-sidecar/telegram_login.py').includes('_force_reconnect') &&
      read('python-sidecar/telegram_login.py').includes('serialize LOKAL dulu') &&
      read('python-sidecar/telegram_scraper.py').includes('payload["sessionString"]') &&
      read('src/lib/runAccountScraper.ts').includes('session export warning') &&
      read('src/lib/runAccountScraper.ts').includes('fromScrape') &&
      tgScrape.includes('sessionString: fromResult'),
  },
  {
    name: 'TG scrape start/idle grace long (bukan putus 20s)',
    ok:
      tgScrape.includes('TG_SCRAPE_START_TIMEOUT_MS') &&
      tgScrape.includes('idleMisses >= 240'),
  },
  {
    name: 'WA protocolTimeout + inboxStable scale idle (akun besar)',
    ok:
      read('electron/main/platformLogin/waPuppeteerChrome.ts').includes('1_200_000') &&
      waScrape.includes('scrapeIdleTimeoutMs(scaleEstimate)') &&
      waScrape.includes('scrapeIdleTimeoutMs(DEVICE_GROUP_TARGET_MAX)'),
  },
  {
    name: 'Idle watchdog scale 5k (scrapeIdleTimeoutMs) + policy mirror',
    ok:
      scaleElectron.includes('scrapeIdleTimeoutMs') &&
      scaleElectron.includes('2_700_000') &&
      scalePolicy.includes('scrapeIdleTimeoutMs') &&
      waScrape.includes('scrapeIdleTimeoutMs(DEVICE_GROUP_TARGET_MAX)') &&
      tgScrape.includes('scrapeIdleTimeoutMs(DEVICE_GROUP_TARGET_MAX)'),
  },
  {
    name: 'WA checkpoint tiap N grup (metadata + invite) + resume',
    ok:
      scaleElectron.includes('WA_SCRAPE_CHECKPOINT_EVERY') &&
      waScrape.includes('WA_SCRAPE_CHECKPOINT_EVERY') &&
      waScrape.includes('loadScrapeCheckpoint') &&
      waScrape.includes('RESUMED_CHECKPOINT'),
  },
  {
    name: 'TG partial checkpoint + version mismatch force-reloads scrape engine',
    ok:
      tgPy.includes('PARTIAL_CHECKPOINT') &&
      tgPy.includes('PARTIAL_AFTER_ERROR') &&
      tgPy.includes('count_active_telegram_scrapes') &&
      read('python-sidecar/main.py').includes('activeScrapes') &&
      read('electron/main/platformLogin/telegramSidecar.ts').includes('activeScrapes') &&
      read('electron/main/platformLogin/telegramSidecar.ts').includes('force restart to load new scrape engine'),
  },
  {
    name: 'TG truncate >6000: hint TRUNCATED (bukan sukses diam)',
    ok:
      tgPy.includes('TRUNCATED_') &&
      tgPy.includes('truncated') &&
      tgPy.includes('ScrapeCancelled') &&
      read('src/services/scrapeFlowService.ts').includes('SCRAPER_TRUNCATED_CAP') &&
      read('src/lib/scrapeErrorUi.ts').includes('SCRAPER_TRUNCATED_CAP'),
  },
  {
    name: 'Manual sync valid: probe device tanpa count daftar grup',
    ok:
      !executeSyncCheckBody.includes('detectGroupsAndBuildSyncPayload') &&
      !executeSyncCheckBody.includes('syncDetectTimeoutMs') &&
      !executeSyncCheckBody.includes('backfillPlatformSessionIfNeeded'),
  },
  {
    name: 'Sync/Scrape gate probe device (strict:true) — bukan disk-only Valid',
    ok:
      gateSrc.includes('strict: true') &&
      !gateSrc.includes('WA_DISK_AUTH') &&
      waLogin.includes('probeWhatsAppSessionLinked') &&
      validateSession.includes('probeWhatsAppSessionLinked') &&
      !validateSession.includes('WA_DISK_AUTH_SYNC_LIGHT') &&
      !validateSession.includes('TG_STORED_SESSION_SYNC_LIGHT'),
  },
  {
    name: 'Post-login Sync: tanpa detect/count device (hindari skala grup)',
    ok: (() => {
      const start = loginFlow.indexOf('export async function applyDailyMetricsAfterLogin');
      const next = loginFlow.indexOf('\nexport async function', start + 1);
      const body = start >= 0 ? loginFlow.slice(start, next > start ? next : undefined) : '';
      return (
        body.length > 0 &&
        !body.includes('quickDeviceCount') &&
        !body.includes('detectGroupsAndBuildSyncPayload')
      );
    })(),
  },
  {
    name: 'Device count IPC/stack dihapus (estimasi inbox hanya di scrape via countWhatsAppGroupsOnDevice)',
    ok:
      !fs.existsSync(path.join(root, 'electron/main/scraper/countWhatsApp.ts')) &&
      !scraperIdx.includes('scraper:count-groups') &&
      waScrape.includes('countWhatsAppGroupsOnDevice') &&
      waScrape.includes('runPooled'),
  },
  {
    name: 'WA scrape metadata concurrency capped',
    ok:
      scaleElectron.includes('WA_SCRAPE_METADATA_CONCURRENCY') &&
      waScrape.includes('WA_SCRAPE_METADATA_CONCURRENCY'),
  },
  {
    name: 'WA puppeteer protocolTimeout configured',
    ok: read('electron/main/platformLogin/waPuppeteerChrome.ts').includes('protocolTimeout'),
  },
  {
    name: 'Later finalisasi sessionOnly + markPlatformSessionSynced',
    ok:
      loginHook.includes('dismissScrapePrompt') &&
      /sessionOnly:\s*true/.test(loginHook) &&
      loginHook.includes('markPlatformSessionSynced'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nDevice group scale (idle watchdog) checks passed.');
