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
const addBar = read('src/components/group-monitoring/OperationsJobQueueAddBar.tsx');

const checks = [
  {
    name: 'WA scrape: invite_link dari device, serial export',
    ok: (() => {
      const scrape = read('electron/main/scraper/whatsappScrape.ts');
      return (
        scrape.includes('fetchWhatsAppGroupInviteLink') &&
        !scrape.includes('invite_link: null') &&
        scrape.includes('waInviteExportDelayMs')
      );
    })(),
  },
  {
    name: 'WA scrape: modul getInviteCode ada',
    ok: waInvite.includes('getInviteCode'),
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
    name: 'TG create group: export invite link setelah create',
    ok: tgAuto.includes('_export_invite_link') && tgAuto.includes('CreateChannelRequest'),
  },
  {
    name: 'TG join: invite_link dari parameter nyata',
    ok: tgAuto.includes('run_join_by_invite_link') && tgAuto.includes('invite_link'),
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
      addBar.includes('inviteLink: group.inviteLink'),
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
