/**
 * Kontrak Operations — bookmark Overview | Job Queue (terpisah).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const opsPanel = read('src/components/group-monitoring/OperationsMonitoringPanel.tsx');
const slicer = read('src/components/group-monitoring/OperationsSlicerHeader.tsx');
const globalPanel = read('src/components/group-monitoring/OperationsGlobalJobQueuePanel.tsx');
const card = read('src/components/group-monitoring/OperationsBrandCard.tsx');
const addBar = read('src/components/group-monitoring/OperationsJobQueueAddBar.tsx');

const checks = [
  {
    name: 'Job Queue branch without brand cards',
    ok:
      opsPanel.includes("filters.bookmark === 'job_queue'") &&
      !/bookmark === 'job_queue'[\s\S]{0,400}OperationsBrandCardList/.test(opsPanel),
  },
  {
    name: 'Job Queue: table + add bar only',
    ok:
      globalPanel.includes('OperationsJobQueueTable') &&
      globalPanel.includes('OperationsJobQueueAddBar') &&
      !globalPanel.includes('OperationsBrandCardList'),
  },
  {
    name: 'Overview: brand cards only',
    ok: !card.includes('ScheduleJoin') && !card.includes('Join missing'),
  },
  {
    name: 'Slicer order: Platform then Brand',
    ok: /filters\.platform[\s\S]*filters\.brand/.test(slicer),
  },
  {
    name: 'Add task: SETUP modal + task type dropdown',
    ok:
      addBar.includes('OperationsJobQueueSetupModal') &&
      addBar.includes("'create_group'") &&
      addBar.includes("'set_admin'") &&
      addBar.includes('operations-job-queue-setup-btn'),
  },
  {
    name: 'Brand follows slicer (no duplicate when filtered)',
    ok:
      addBar.includes("brandFilter === 'all'") &&
      addBar.includes('operations-job-queue-field--readonly'),
  },
  {
    name: 'Queue table: Progress only (no Result column)',
    ok: (() => {
      const table = read('src/components/group-monitoring/OperationsJobQueueTable.tsx');
      return (
        table.includes('colJoinedTotal') &&
        table.includes('colProgress') &&
        !table.includes("key: 'result'")
      );
    })(),
  },
  {
    name: 'Create group: wired via SETUP modal + worker settings',
    ok:
      read('src/components/group-monitoring/OperationsJobQueueSetupModal.tsx').includes(
        'createTotalToCreate',
      ) && addBar.includes('saveCreateBatch'),
  },
  {
    name: 'Set admin: super-admin + SETUP modal',
    ok:
      addBar.includes('loadSuperAdminGroupsForSetAdmin') &&
      read('src/components/group-monitoring/OperationsJobQueueSetupModal.tsx').includes(
        'selectedSetAdminGroupIds',
      ),
  },
  {
    name: 'Join: invite-link delay settings wired',
    ok: (() => {
      const cfg = read('src/config/workerPlatformSettings.ts');
      const wa = read('electron/main/automation/waAutomation.ts');
      return cfg.includes('invite_delay_min_sec') && wa.includes('applyJoinInviteDelay');
    })(),
  },
  {
    name: 'WA create: worker settings wired in waAutomation',
    ok: (() => {
      const wa = read('electron/main/automation/waAutomation.ts');
      return (
        wa.includes('applyWaCreateGroupSettings') &&
        wa.includes('after_create_sec') &&
        wa.includes('between_groups_sec')
      );
    })(),
  },
  {
    name: 'Electron: batch create_group runner (single job, N groups)',
    ok: (() => {
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const wa = read('electron/main/automation/waAutomation.ts');
      return (
        runner.includes('runCreateGroupBatchJob') &&
        runner.includes('runWhatsAppCreateGroupBatch') &&
        wa.includes('runWhatsAppCreateGroupBatch')
      );
    })(),
  },
  {
    name: 'Electron: job queue IPC + boot resume runner',
    ok: (() => {
      const auto = read('electron/main/automation/index.ts');
      return (
        auto.includes("ipcMain.handle('jobQueue:enqueue'") &&
        auto.includes('scheduleRunnerTick(0)')
      );
    })(),
  },
  {
    name: 'Electron: runner max concurrent selaras WA pool (4 default)',
    ok: (() => {
      const conc = read('electron/main/automation/jobQueueConcurrency.ts');
      const pool = read('electron/main/platformLogin/waBrowserPool.ts');
      return conc.includes('getMaxWaBrowserSlots') && pool.includes('RM_WA_MAX_CONCURRENT_BROWSERS');
    })(),
  },
  {
    name: 'Electron: scrape/session guard for job queue',
    ok: (() => {
      const cancel = read('electron/main/scraper/scrapeCancel.ts');
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const scraper = read('electron/main/scraper/index.ts');
      const guard = read('electron/main/automation/jobQueueGuard.ts');
      const settle = read('electron/main/automation/jobQueueSettle.ts');
      return (
        cancel.includes('isScrapeActiveForSession') &&
        runner.includes('isScrapeActiveForSession') &&
        runner.includes('isSessionSettling') &&
        runner.includes('markSessionSettleAfterJob') &&
        guard.includes('assertAccountExecuteAllowed') &&
        guard.includes('isAccountJobQueueBusy') &&
        scraper.includes('assertAccountExecuteAllowed') &&
        settle.includes('POST_JOB_SETTLE_MS')
      );
    })(),
  },
  {
    name: 'Electron: job payload adminRights typed',
    ok: read('electron/main/automation/jobQueueTypes.ts').includes('adminRights'),
  },
  {
    name: 'Join/set_admin: progress + job timeout',
    ok: (() => {
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const wa = read('electron/main/automation/waAutomation.ts');
      const ui = read('src/lib/operationsJobQueueUi.ts');
      return (
        runner.includes('withJobTimeout') &&
        runner.includes('failStaleRunningJobs') &&
        wa.includes('withPromiseTimeout') &&
        wa.includes('acceptInvite') &&
        ui.includes('isJobQueueStepInProgress')
      );
    })(),
  },
  {
    name: 'Real data: WA scrape + create ambil invite_link device',
    ok: (() => {
      const scrape = read('electron/main/scraper/whatsappScrape.ts');
      const wa = read('electron/main/automation/waAutomation.ts');
      return (
        scrape.includes('fetchWhatsAppGroupInviteLink') &&
        !scrape.includes('invite_link: null') &&
        wa.includes('fetchWhatsAppGroupInviteLink')
      );
    })(),
  },
  {
    name: 'Add bar: one enqueue per account (groups batch)',
    ok: (() => {
      const add = read('src/components/group-monitoring/OperationsJobQueueAddBar.tsx');
      return add.includes('groupsByAccount') && add.includes('payload: { groups }');
    })(),
  },
  {
    name: 'Sync probe: no warm before gate (single Chrome path)',
    ok: (() => {
      const session = read('src/lib/userActionSession.ts');
      return session.includes('gateDeviceSession') && !session.includes('warmSessionIfStored');
    })(),
  },
  {
    name: 'Renderer: job queue client + execute blocking',
    ok: (() => {
      const client = read('src/lib/automationJobQueueClient.ts');
      const sync = read('src/hooks/useAccountSyncFlow.ts');
      const autoSync = read('src/hooks/useAutoAccountSync.ts');
      return (
        client.includes('enqueueAutomationJob') &&
        client.includes('resolveAccountExecuteBlock') &&
        client.includes('isHeavyDeviceExecuteBlocked') &&
        sync.includes('resolveAccountExecuteBlock') &&
        autoSync.includes('isHeavyDeviceExecuteBlocked')
      );
    })(),
  },
];

let failed = 0;
for (const check of checks) {
  if (check.ok) {
    console.log(`OK  ${check.name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${check.name}`);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log('validate-operations-job-queue: all checks passed');
