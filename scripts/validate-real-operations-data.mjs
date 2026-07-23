/**
 * Kontrak data nyata — scrape / job queue / daily / master.
 * DILARANG: mock, dummy, fake, invite_link hardcode null di path produksi.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const waScrape = read('electron/main/scraper/whatsappScrape.ts');
const waInvite = read('electron/main/scraper/whatsappGroupInviteLink.ts');
const waAuto = read('electron/main/automation/waAutomation.ts');
const tgAuto = read('python-sidecar/telegram_automation.py');
const tgScrape = read('python-sidecar/telegram_scraper.py');
const accountScraper = read('src/lib/accountScraper.ts');
const runScraper = read('src/lib/runAccountScraper.ts');
const joinLoad = read('src/lib/loadMissingMasterGroupsForJoin.ts');
/** Join enqueue (invite dari master) — shared hook; AddBar hanya thin UI. */
const joinEnqueue = read('src/hooks/useJobQueueSetupEnqueue.ts');

const checks = [
  {
    name: 'WA scrape: invite_link dari device, serial export',
    ok: (() => {
      const scrape = read('electron/main/scraper/whatsappScrape.ts');
      return (
        scrape.includes('fetchWhatsAppGroupInviteLink') &&
        scrape.includes('waInviteExportDelayMs') &&
        scrape.includes("is_admin === 'yes'") &&
        !scrape.includes('chat.whatsapp.com/PLACEHOLDER') &&
        !scrape.includes('invite_link: `https://')
      );
    })(),
  },
  {
    name: 'WA scrape: modul getInviteCode + store Mex fallback',
    ok:
      waInvite.includes('getInviteCode') &&
      waInvite.includes('WAWebMexFetchGroupInviteCodeJob') &&
      waInvite.includes('fetchInviteCodeFromStore'),
  },
  {
    name: 'WA create group: invite_link real setelah create',
    ok:
      waAuto.includes('fetchWhatsAppGroupInviteLink') &&
      /invite_link/.test(waAuto) &&
      waAuto.includes('client.createGroup'),
  },
  {
    name: 'WA join: acceptInvite + link dari payload',
    ok: waAuto.includes('client.acceptInvite') && waAuto.includes('inviteLink'),
  },
  {
    name: 'WA set admin: promoteParticipants real',
    ok: waAuto.includes('promoteParticipants'),
  },
  {
    name: 'TG scrape: resolve invite_link per grup',
    ok: tgScrape.includes('_resolve_invite_link') && tgScrape.includes('"invite_link"'),
  },
  {
    name: 'TG scrape: GetFull-first member count + exported_invite (learning Script Worker)',
    ok: (() => {
      return (
        tgScrape.includes('_fetch_full_meta') &&
        tgScrape.includes('GetFullChannelRequest') &&
        tgScrape.includes('exported_invite') &&
        tgScrape.includes('existing_invite') &&
        tgScrape.indexOf('_fetch_full_meta') < tgScrape.indexOf('get_participants')
      );
    })(),
  },
  {
    name: 'TG scrape: TIDAK ada quality gate SCRAPE_INCOMPLETE / SCRAPE_TOO_FAST',
    ok:
      !tgScrape.includes('SCRAPE_INCOMPLETE') &&
      !tgScrape.includes('SCRAPE_TOO_FAST') &&
      !tgScrape.includes('_assert_scrape_quality'),
  },
  {
    name: 'TG scrape: FloodWait + throttle + invite admin-only',
    ok: (() => {
      return (
        tgScrape.includes('FloodWaitError') &&
        tgScrape.includes('scrape_between_groups_sec') &&
        tgScrape.includes('is_admin=bool(is_admin_flag)') &&
        tgScrape.includes('utils.get_peer_id')
      );
    })(),
  },
  {
    name: 'TG create: invite GetFull exported_invite dulu lalu ExportChatInvite',
    ok:
      tgAuto.includes('CreateChannelRequest') &&
      tgAuto.includes('GetFullChannelRequest') &&
      tgAuto.includes('exported_invite') &&
      tgAuto.includes('_export_invite_link'),
  },
  {
    name: 'TG create: no orphan on post-create FloodWait + peer group_id + no fake invite',
    ok: (() => {
      return (
        tgAuto.includes('_peer_group_id') &&
        tgAuto.includes('flood_wait_partial') &&
        tgAuto.includes('_is_http_invite_link') &&
        !tgAuto.includes('return peer')
      );
    })(),
  },
  {
    name: 'TG join: already_member private invite tidak false-fail',
    ok:
      tgAuto.includes('UserAlreadyParticipantError') &&
      tgAuto.includes('already_member": True') &&
      tgAuto.includes('Private invite'),
  },
  {
    name: 'TG join: invite_link dari parameter nyata',
    ok: tgAuto.includes('run_join_by_invite_link') && tgAuto.includes('invite_link'),
  },
  {
    name: 'TG automation: _prepare_session tidak deadlock restore (under tg_session_lock)',
    ok: (() => {
      const prepareBlock = tgAuto.slice(
        tgAuto.indexOf('async def _prepare_session'),
        tgAuto.indexOf('async def _resolve_group_entity') > 0
          ? tgAuto.indexOf('async def _resolve_group_entity')
          : tgAuto.indexOf('async def run_create_group'),
      );
      return (
        tgAuto.includes('_restore_telegram_session_locked') &&
        prepareBlock.includes('_restore_telegram_session_locked') &&
        !prepareBlock.includes('restore_telegram_session(')
      );
    })(),
  },
  {
    name: 'TG set admin: phone normalize + FloodWait retry',
    ok:
      tgAuto.includes('_normalize_set_admin_target') &&
      tgAuto.includes('FloodWait retry failed'),
  },
  {
    name: 'Scrape → daily atomik rm_commit_account_scrape + invite_link kolom',
    ok:
      accountScraper.includes('invite_link: group.invite_link') &&
      accountScraper.includes("rpc('rm_commit_account_scrape'") &&
      accountScraper.includes('invalidateMasterDailyCacheForScrape'),
  },
  {
    name: 'runAccountScraper: Electron scrape → writeScrapeDailyRows',
    ok:
      runScraper.includes('api.run') &&
      runScraper.includes('writeScrapeDailyRows'),
  },
  {
    name: 'Join queue: invite dari master DB (loadMissingMasterGroupsJoinSnapshot)',
    ok:
      joinLoad.includes('loadMasterDailyForAccount') &&
      joinLoad.includes('inviteLink') &&
      joinEnqueue.includes('loadMissingMasterGroupsJoinSnapshot') &&
      joinEnqueue.includes('inviteLink: group.inviteLink'),
  },
  {
    name: 'Master rebuild atomik dalam rm_commit_account_scrape (bukan client delete terpisah)',
    ok:
      accountScraper.includes("rpc('rm_commit_account_scrape'") &&
      !accountScraper.includes('rebuildBrandGroupsMaster'),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} real-operations-data check(s) failed`);
  process.exit(1);
}
console.log('\nReal operations data contract checks passed.');
