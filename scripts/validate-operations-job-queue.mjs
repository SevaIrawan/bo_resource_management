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
    name: 'Exit & delete: exit SETUP + delete from VIEW result',
    ok: (() => {
      const modal = read('src/components/group-monitoring/OperationsJobQueueDetailModal.tsx');
      const detail = read('src/components/group-monitoring/OperationsJobQueueDetailModal.tsx');
      const flow = read('src/lib/exitDeleteFlow.ts');
      return (
        addBar.includes('exitDeletePhase') &&
        addBar.includes("'leave_group'") &&
        detail.includes('queueDeleteFromExit') &&
        modal.includes('onQueueDeleteFromExit') &&
        flow.includes('resolveLeftGroupsFromExitJob')
      );
    })(),
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
    name: 'Electron: create_group batch markJobFinished persists groupOutcomes',
    ok: (() => {
      const store = read('electron/main/automation/jobQueueStore.ts');
      return (
        store.includes('isCreateBatch') &&
        store.includes('job.payload.groupOutcomes = detail.groupOutcomes') &&
        store.includes('if (detail?.groupOutcomes?.length)')
      );
    })(),
  },
  {
    name: 'Electron: create_group batch persists groupOutcomes per group',
    ok: (() => {
      const wa = read('electron/main/automation/waAutomation.ts');
      const tg = read('electron/main/automation/tgAutomationClient.ts');
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      return (
        wa.includes("createStatus: 'created'") &&
        wa.includes('groupOutcomes') &&
        tg.includes("createStatus: 'created'") &&
        tg.includes('groupOutcomes') &&
        runner.includes('resolveCreateGroupOutcomesFromSingle')
      );
    })(),
  },
  {
    name: 'Renderer: create_group VIEW rows from groupOutcomes (groupId + invite)',
    ok: (() => {
      const ui = read('src/lib/operationsJobQueueUi.ts');
      return (
        ui.includes("row.createStatus !== 'failed'") &&
        ui.includes('resolveCreateGroupResultOutcomes') &&
        ui.includes("'groupName', 'groupId', 'inviteLink', 'status'") &&
        ui.includes('createStatusCreated')
      );
    })(),
  },
  {
    name: 'Set photo: flow from create VIEW + brand photo path + automation',
    ok: (() => {
      const flow = read('src/lib/createSetPhotoFlow.ts');
      const enqueue = read('src/lib/enqueueSetPhotoFromCreateJob.ts');
      const wa = read('electron/main/automation/waSetGroupPhoto.ts');
      const tg = read('python-sidecar/telegram_set_group_photo.py');
      const main = read('python-sidecar/main.py');
      const brand = read('electron/main/brandGroupPhoto.ts');
      return (
        flow.includes('resolveCreatedGroupsFromCreateJob') &&
        flow.includes('canQueueSetPhotoFromCreateJob') &&
        enqueue.includes('set_group_photo') &&
        enqueue.includes('sourceCreateJobId') &&
        wa.includes('setPicture') &&
        tg.includes('EditPhotoRequest') &&
        main.includes('set-group-photo') &&
        brand.includes('brand-group-photos')
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
    name: 'Exit tab: filter jobMatchesTaskType (no join overlap)',
    ok: (() => {
      const global = read('src/components/group-monitoring/OperationsGlobalJobQueuePanel.tsx');
      const ui = read('src/lib/operationsJobQueueUi.ts');
      const flow = read('src/lib/exitDeleteFlow.ts');
      return (
        global.includes('jobMatchesTaskType') &&
        ui.includes('jobMatchesExitDeleteTaskType') &&
        flow.includes("job.action === 'leave_group' && job.payload.exitDeletePhase === 'exit'") &&
        flow.includes('sourceExitJobId')
      );
    })(),
  },
  {
    name: 'Exit SETUP: daily snapshot + processed-group guard',
    ok: (() => {
      const loader = read('src/lib/loadAccountDailyGroupsForLeaveDelete.ts');
      const flow = read('src/lib/exitDeleteFlow.ts');
      const setup = read('src/components/group-monitoring/OperationsJobQueueSetupModal.tsx');
      return (
        loader.includes('daily: AccountDailyGroupForLeaveDelete[]') &&
        loader.includes('breakdown.junk') &&
        flow.includes('exitDeleteProcessedGroupIdSet') &&
        setup.includes('processedExitGroupIds') &&
        setup.includes('exitGroupProcessedAlertOpen')
      );
    })(),
  },
  {
    name: 'Exit enqueue: leave_group exit phase only (not legacy combined)',
    ok: (() => {
      const add = read('src/components/group-monitoring/OperationsJobQueueAddBar.tsx');
      const del = read('src/lib/enqueueDeleteFromExitJob.ts');
      return (
        add.includes("action: 'leave_group'") &&
        add.includes("exitDeletePhase: 'exit'") &&
        !add.includes("action: 'exit_delete_group'") &&
        del.includes("action: 'delete_group'") &&
        del.includes('sourceExitJobId')
      );
    })(),
  },
  {
    name: 'Delete from VIEW: enqueue + auto-run + close modal',
    ok: (() => {
      const global = read('src/components/group-monitoring/OperationsGlobalJobQueuePanel.tsx');
      const table = read('src/components/group-monitoring/OperationsJobQueueTable.tsx');
      return (
        global.includes('runAutomationJob(result.jobId)') &&
        global.includes('QueueFromViewResult') &&
        table.includes('setViewJobId(null)') &&
        table.includes('QueueFromViewResult')
      );
    })(),
  },
  {
    name: 'VIEW queue: enqueue error feedback wired',
    ok: (() => {
      const map = read('src/lib/mapEnqueueJobQueueError.ts');
      const create = read('src/components/group-monitoring/OperationsJobQueueCreateGroupViewModal.tsx');
      const detail = read('src/components/group-monitoring/OperationsJobQueueDetailModal.tsx');
      const add = read('src/components/group-monitoring/OperationsJobQueueAddBar.tsx');
      return (
        map.includes('NO_LEFT_GROUPS') &&
        map.includes('NO_CREATED_GROUPS') &&
        create.includes('queueError') &&
        create.includes('mapEnqueueJobQueueError') &&
        detail.includes('queueError') &&
        add.includes('mapEnqueueJobQueueError')
      );
    })(),
  },
  {
    name: 'WA leave_group: runWaLeaveGroup imported',
    ok: (() => {
      const wa = read('electron/main/automation/waAutomation.ts');
      return wa.includes("import { runWaLeaveGroup }") && wa.includes('runWaLeaveGroup(');
    })(),
  },
  {
    name: 'Batch create: stall guard when slice creates zero',
    ok: (() => {
      const wa = read('electron/main/automation/waAutomation.ts');
      const tg = read('electron/main/automation/tgAutomationClient.ts');
      return (
        wa.includes('createdBeforeSlice') &&
        wa.includes('created === createdBeforeSlice') &&
        tg.includes('createdBeforeSlice') &&
        tg.includes('created === createdBeforeSlice')
      );
    })(),
  },
  {
    name: 'Batch create: withJobTimeout wrapper',
    ok: (() => {
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      return (
        runner.includes('async function runCreateGroupBatchJob') &&
        runner.includes('withJobTimeout') &&
        runner.includes('runWhatsAppCreateGroupBatch')
      );
    })(),
  },
  {
    name: 'Electron delay: set_photo_max_retry typed',
    ok: (() => {
      const jq = read('electron/main/automation/jobQueueTypes.ts');
      const auto = read('electron/main/automation/types.ts');
      return jq.includes('set_photo_max_retry') && auto.includes('set_photo_max_retry');
    })(),
  },
  {
    name: 'Parallel execute: max 4 accounts via shared execute slot pool',
    ok: (() => {
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const store = read('electron/main/automation/jobQueueStore.ts');
      const pool = read('electron/main/automation/executeSlotPool.ts');
      const conc = read('electron/main/automation/jobQueueConcurrency.ts');
      return (
        conc.includes('getMaxWaBrowserSlots') &&
        pool.includes("kind: ExecuteSlotKind") &&
        pool.includes('getMaxWaBrowserSlots') &&
        runner.includes('waitForExecuteSlot') &&
        runner.includes('countFreeExecuteSlots') &&
        store.includes('countFreeExecuteSlots') &&
        store.includes('getExecuteSlotStats')
      );
    })(),
  },
  {
    name: 'All job actions: timeout + batch step total wired',
    ok: (() => {
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const batch = read('electron/main/automation/jobQueueBatchHelpers.ts');
      return (
        runner.includes('leave_group:') &&
        runner.includes('delete_group:') &&
        runner.includes('exit_delete_group:') &&
        runner.includes('join_by_invite_link:') &&
        runner.includes('set_admin:') &&
        runner.includes('create_group:') &&
        batch.includes('leave_group') &&
        batch.includes('delete_group')
      );
    })(),
  },
  {
    name: 'Enqueue helpers: shared account row stub',
    ok: (() => {
      const helper = read('src/lib/accountRowFromAutomationJob.ts');
      const setPhoto = read('src/lib/enqueueSetPhotoFromCreateJob.ts');
      const del = read('src/lib/enqueueDeleteFromExitJob.ts');
      return (
        helper.includes('accountRowFromAutomationJob') &&
        setPhoto.includes('accountRowFromAutomationJob') &&
        del.includes('accountRowFromAutomationJob')
      );
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
        client.includes('isHeavyDeviceExecuteBlockedForAccount') &&
        !client.includes('clearCompletedAutomationJobs') &&
        !client.includes('isHeavyDeviceExecuteBlocked()') &&
        sync.includes('resolveAccountExecuteBlock') &&
        autoSync.includes('isHeavyDeviceExecuteBlockedForAccount')
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
