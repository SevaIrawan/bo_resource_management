/**
 * Kontrak Job Queue — Tab Operations (bukan Account).
 * Shared: JobQueueSetupHost + useJobQueueSetupEnqueue (dipakai Ops AddBar).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const opsPanel = read('src/components/group-monitoring/OperationsMonitoringPanel.tsx');
const opsSlicer = read('src/components/group-monitoring/OperationsSlicerHeader.tsx');
const globalPanel = read('src/components/group-monitoring/OperationsGlobalJobQueuePanel.tsx');
const setupHost = read('src/components/group-monitoring/JobQueueSetupHost.tsx');
const enqueueHook = read('src/hooks/useJobQueueSetupEnqueue.ts');
const addBar = read('src/components/group-monitoring/OperationsJobQueueAddBar.tsx');
const accountBody = read('src/components/group-monitoring/AccountMonitoringBody.tsx');
const accountCells = read('src/components/group-monitoring/AccountMonitoringCells.tsx');
const accountTableParts = read('src/components/group-monitoring/AccountMonitoringTableParts.tsx');
const monitoringType = read('src/types/monitoring.ts');

const checks = [
  {
    name: 'Tab Operations + Account tetap ada',
    ok: monitoringType.includes("'operations'") && monitoringType.includes("'account'"),
  },
  {
    name: 'Account tab: tanpa Job Queue (kolom/panel/session)',
    ok:
      !accountBody.includes('JobQueue') &&
      !accountBody.includes('jobQueue') &&
      !accountCells.includes('AccountJobQueueCell') &&
      !accountCells.includes('onJobQueueSelect') &&
      !accountTableParts.includes('job-queue') &&
      !accountTableParts.includes('colJobQueue') &&
      !fs.existsSync(path.join(root, 'src/components/group-monitoring/AccountJobQueueSession.tsx')) &&
      !fs.existsSync(path.join(root, 'src/components/group-monitoring/JobQueuePanel.tsx')),
  },
  {
    name: 'Ops shell: langsung Job Queue + slicer Platform saja',
    ok:
      opsPanel.includes('OperationsGlobalJobQueuePanel') &&
      opsPanel.includes('brandFilter="all"') &&
      !opsPanel.includes('OperationsBrandCardList') &&
      !opsPanel.includes('bookmark') &&
      opsSlicer.includes('OPERATIONS_PLATFORM_OPTIONS') &&
      !opsSlicer.includes('uniqueAccountBrands') &&
      !opsSlicer.includes('account-slicer-view-toggle') &&
      globalPanel.includes('OperationsJobQueueTable') &&
      globalPanel.includes('OperationsJobQueueAddBar'),
  },
  {
    name: 'Shared setup host + enqueue hook',
    ok:
      setupHost.includes('useJobQueueSetupEnqueue') &&
      setupHost.includes('OperationsJobQueueSetupModal') &&
      enqueueHook.includes('enqueueAndTryRunAutomationJob') &&
      enqueueHook.includes('saveJoinBatch') &&
      enqueueHook.includes('saveCreateBatch') &&
      enqueueHook.includes('saveSetAdminBatch') &&
      enqueueHook.includes('saveExitBatch'),
  },
  {
    name: 'AddBar thin consumer pakai JobQueueSetupHost',
    ok:
      addBar.includes('JobQueueSetupHost') &&
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
    name: 'SETUP Queue: enqueue + try-run all task types (hook)',
    ok:
      enqueueHook.includes('enqueueAndTryRunAutomationJob') &&
      enqueueHook.includes('saveJoinBatch') &&
      enqueueHook.includes('saveCreateBatch') &&
      enqueueHook.includes('saveSetAdminBatch') &&
      enqueueHook.includes('saveExitBatch') &&
      read('src/components/group-monitoring/OperationsJobQueueSetupModal.tsx').includes(
        'createTotalToCreate',
      ),
  },
  {
    name: 'Create group permissions: modal draft only at enqueue (no Settings merge)',
    ok: (() => {
      const setup = read('src/components/group-monitoring/OperationsJobQueueSetupModal.tsx');
      const hook = read('src/hooks/useJobQueueSetupEnqueue.ts');
      const lib = read('src/lib/createGroupWorkerSettings.ts');
      return (
        hook.includes('buildCreateGroupEnqueueFromJobDraft') &&
        lib.includes('buildCreateGroupEnqueueFromJobDraft') &&
        !hook.includes('workerSettings.createGroup.messagesAdminsOnly') &&
        !hook.includes('workerSettings.createGroup.hideChatHistoryForMembers') &&
        !setup.includes('persistWhatsAppWorkerSettings') &&
        !setup.includes('persistTelegramWorkerSettings') &&
        setup.includes('loadCreateGroupPermissionDefaultsFromSettings') &&
        setup.includes('setCreateGroupPermissionLocal')
      );
    })(),
  },
  {
    name: 'Create group runner: permission from job payload only',
    ok: (() => {
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const wa = read('electron/main/automation/waAutomation.ts');
      return (
        runner.includes('createGroupSettings: job.payload.createGroupSettings') &&
        wa.includes('payload.createGroupSettings')
      );
    })(),
  },
  {
    name: 'Set admin: super-admin + SETUP modal',
    ok:
      enqueueHook.includes('loadSuperAdminGroupsForSetAdmin') &&
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
        enqueueHook.includes('exitDeletePhase') &&
        enqueueHook.includes("'leave_group'") &&
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
        wa.includes('applyCreateGroupSettingsViaPage') &&
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
        store.includes('mergeJobGroupOutcomes') &&
        store.includes('if (detail?.groupOutcomes?.length)') &&
        store.includes('attachJobGroupOutcomes') &&
        store.includes('demoteRunningJobToPaused')
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
        wa.includes('persistPartial') &&
        wa.includes('attachJobGroupOutcomes') &&
        tg.includes("createStatus: 'created'") &&
        tg.includes('groupOutcomes') &&
        tg.includes('persistPartial') &&
        tg.includes('{ retry: false }') &&
        runner.includes('resolveCreateGroupOutcomesFromSingle') &&
        runner.includes('group(s) created before error')
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
    name: 'Set photo: auto-enqueue after create (opsi C)',
    ok: (() => {
      const auto = read('electron/main/automation/autoEnqueueSetPhotoFromCreate.ts');
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const flow = read('src/lib/createSetPhotoFlow.ts');
      const en = read('src/i18n/locales/en.ts');
      return (
        auto.includes('maybeAutoEnqueueSetPhotoFromCreate') &&
        auto.includes('sourceCreateJobId') &&
        auto.includes('set_group_photo') &&
        runner.includes('tryAutoEnqueueSetPhotoAfterCreate') &&
        runner.includes('maybeAutoEnqueueSetPhotoFromCreate') &&
        flow.includes('createRemarkSetPhotoAutoPending') &&
        en.includes('createRemarkSetPhotoAutoPending')
      );
    })(),
  },
  {
    name: 'Leave: auto-enqueue delete after exit (left groups only)',
    ok: (() => {
      const auto = read('electron/main/automation/autoEnqueueDeleteFromExit.ts');
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const flow = read('src/lib/exitDeleteFlow.ts');
      const del = read('src/lib/enqueueDeleteFromExitJob.ts');
      const en = read('src/i18n/locales/en.ts');
      return (
        auto.includes('maybeAutoEnqueueDeleteFromExit') &&
        auto.includes('sourceExitJobId') &&
        auto.includes("exitStatus === 'left'") &&
        auto.includes('requireOwnerForDelete: false') &&
        auto.includes('delete_group') &&
        runner.includes('tryAutoEnqueueDeleteAfterExit') &&
        runner.includes('maybeAutoEnqueueDeleteFromExit') &&
        flow.includes('resolveExitJobDeleteFollowUpRemarkKey') &&
        del.includes('requireOwnerForDelete: false') &&
        en.includes('exitRemarkDeleteAutoPending')
      );
    })(),
  },
  {
    name: 'TG delete after leave: local dialog tolerates already-left',
    ok: (() => {
      const py = read('python-sidecar/telegram_delete_group.py');
      const tg = read('electron/main/automation/tgAutomationClient.ts');
      return (
        py.includes('UserNotParticipantError') &&
        py.includes('already_left') &&
        py.includes('_delete_local_dialog') &&
        py.includes('require_owner') &&
        tg.includes('sleepBetweenGroups') &&
        tg.includes("action: 'leave_group'") &&
        tg.includes("action: 'delete_group'")
      );
    })(),
  },
  {
    name: 'TG set photo/admin: sleepBetweenGroups wired',
    ok: (() => {
      const tg = read('electron/main/automation/tgAutomationClient.ts');
      const adminBlock = tg.split("payload.action === 'set_admin'")[1]?.slice(0, 2500) ?? '';
      const photoBlock = tg.split("payload.action === 'set_group_photo'")[1]?.slice(0, 2500) ?? '';
      return (
        adminBlock.includes('sleepBetweenGroups') &&
        photoBlock.includes('sleepBetweenGroups')
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
        wa.includes('setPhotoViaPageEvaluate') &&
        wa.includes('WWebJS.setPicture') &&
        !wa.includes('client.getChatById') &&
        tg.includes('EditPhotoRequest') &&
        main.includes('set-group-photo') &&
        brand.includes('brand-group-photos')
      );
    })(),
  },
  {
    name: 'Set photo: remark + tab lock from single flow module (no duplicate logic)',
    ok: (() => {
      const flow = read('src/lib/createSetPhotoFlow.ts');
      const ui = read('src/lib/operationsJobQueueUi.ts');
      const viewModal = read(
        'src/components/group-monitoring/OperationsJobQueueCreateGroupViewModal.tsx',
      );
      return (
        flow.includes('findSetPhotoJobForCreateJob') &&
        flow.includes('createJobHasSetPhotoFollowUp') &&
        flow.includes('resolveCreateJobSetPhotoFollowUpRemarkKey') &&
        flow.includes('resolveSetPhotoJobRemarkKey') &&
        flow.includes('isSetPhotoFollowUpLockStatus') &&
        ui.includes('resolveCreateJobSetPhotoFollowUpRemarkKey') &&
        ui.includes('resolveSetPhotoJobRemarkKey') &&
        !ui.includes('setPhotoCompleted') &&
        viewModal.includes('isCreateGroupSetPhotoTabLocked') &&
        viewModal.includes('createJobHasSetPhotoFollowUp') === false
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
    name: 'Electron: runner max concurrent per platform (WA/TG 10)',
    ok: (() => {
      const conc = read('electron/main/automation/jobQueueConcurrency.ts');
      const pool = read('electron/main/platformLogin/waBrowserPool.ts');
      return (
        conc.includes('getMaxWaBrowserSlots') &&
        conc.includes('getMaxTgExecuteSlots') &&
        pool.includes('RM_WA_MAX_CONCURRENT_BROWSERS')
      );
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
        runner.includes('isAutoScrapeActiveForSession') &&
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
        runner.includes('withJobTimeoutSettle') &&
        runner.includes('failStaleRunningJobs') &&
        wa.includes('withPromiseTimeout') &&
        wa.includes('acceptInvite') &&
        ui.includes('isJobQueueStepInProgress')
      );
    })(),
  },
  {
    name: 'WA getChatById flake: create/join survive Error "r" + partial ok completed',
    ok: (() => {
      const wa = read('electron/main/automation/waAutomation.ts');
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const ui = read('src/lib/operationsJobQueueUi.ts');
      const timeout = read('electron/main/automation/promiseTimeout.ts');
      return (
        wa.includes('resolveGroupChatOptional') &&
        wa.includes('isCrypticWaEvaluateError') &&
        wa.includes('probeGroupViaPage') &&
        wa.includes('promoteViaPageEvaluate') &&
        wa.includes('applyCreateGroupSettingsViaPage') &&
        wa.includes('WAWebModifyParticipantsGroupAction') &&
        !wa.includes('client.getChatById') &&
        /acceptInvite[\s\S]{0,800}resolveGroupChatOptional/.test(wa) &&
        runner.includes('humanizeJobError') &&
        !runner.includes('if (batch && success < total)') &&
        ui.includes('WhatsApp store flake — retry') &&
        timeout.includes('if (settled) return')
      );
    })(),
  },
  {
    name: 'Account reload: timeout + queue when busy (anti Loading stuck)',
    ok: (() => {
      const provider = read('src/providers/GroupMonitoringProvider.tsx');
      return (
        provider.includes('reloadAllQueuedRef') &&
        provider.includes('LOAD_ACCOUNTS_TIMEOUT') &&
        provider.includes('translateRef') &&
        provider.includes('!timedOut') &&
        provider.includes('45_000')
      );
    })(),
  },
  {
    name: 'WA scrape invite: store/page only (no getChatById Node)',
    ok: (() => {
      const invite = read('electron/main/scraper/whatsappGroupInviteLink.ts');
      return (
        invite.includes('fetchInviteCodeFromStore') &&
        invite.includes('inviteFromStore') &&
        invite.includes('WAWebMexFetchGroupInviteCodeJob') &&
        !/client\.getChatById/.test(invite) &&
        !invite.includes('fetchInviteCodeViaGroupChatApi')
      );
    })(),
  },
  {
    name: 'Real data: WA scrape + create ambil invite_link device',
    ok: (() => {
      const scrape = read('electron/main/scraper/whatsappScrape.ts');
      const invite = read('electron/main/scraper/whatsappGroupInviteLink.ts');
      const wa = read('electron/main/automation/waAutomation.ts');
      return (
        scrape.includes('fetchWhatsAppGroupInviteLink') &&
        invite.includes('fetchInviteCodeFromStore') &&
        scrape.includes("is_admin === 'yes' && !row.invite_link") &&
        wa.includes('fetchWhatsAppGroupInviteLink')
      );
    })(),
  },
  {
    name: 'Add bar: one enqueue per account (groups batch)',
    ok: (() => {
      const hook = read('src/hooks/useJobQueueSetupEnqueue.ts');
      return hook.includes('groupsByAccount') && hook.includes('payload: { groups: chunk }');
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
    name: 'Exit enqueue: leave_group exit phase + daily/junk + deleteEnabled flag',
    ok: (() => {
      const hook = read('src/hooks/useJobQueueSetupEnqueue.ts');
      const del = read('src/lib/enqueueDeleteFromExitJob.ts');
      const start = hook.indexOf('async function saveExitBatch');
      const body = start >= 0 ? hook.slice(start, start + 2800) : '';
      return (
        body.includes("action: 'leave_group'") &&
        body.includes("exitDeletePhase: 'exit'") &&
        body.includes('accountExitGroups.daily') &&
        body.includes('accountExitGroups.junk') &&
        body.includes('deleteEnabled: workerSettings.leaveDelete.deleteEnabled') &&
        !body.includes("action: 'exit_delete_group'") &&
        del.includes("action: 'delete_group'") &&
        del.includes('sourceExitJobId')
      );
    })(),
  },
  {
    name: 'Auto set_photo after create + auto delete after left',
    ok: (() => {
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const photo = read('electron/main/automation/autoEnqueueSetPhotoFromCreate.ts');
      const del = read('electron/main/automation/autoEnqueueDeleteFromExit.ts');
      return (
        runner.includes('tryAutoEnqueueSetPhotoAfterCreate') &&
        runner.includes('tryAutoEnqueueDeleteAfterExit') &&
        /markJobFinished[\s\S]{0,500}tryAutoEnqueueSetPhotoAfterCreate/.test(runner) &&
        /markJobFinished[\s\S]{0,800}tryAutoEnqueueDeleteAfterExit/.test(runner) &&
        photo.includes('sourceCreateJobId') &&
        photo.includes('userId') &&
        del.includes("exitStatus === 'left'") &&
        del.includes('deleteEnabled === false') &&
        del.includes("action: 'delete_group'")
      );
    })(),
  },
  {
    name: 'CTA table: Run/Pause/Cancel + VIEW queue delete/photo',
    ok: (() => {
      const panel = read('src/components/group-monitoring/OperationsGlobalJobQueuePanel.tsx');
      const table = read('src/components/group-monitoring/OperationsJobQueueTable.tsx');
      const ui = read('src/lib/operationsJobQueueUi.ts');
      const account = read('src/components/group-monitoring/AccountMonitoringCells.tsx');
      return (
        panel.includes('handleRun') &&
        panel.includes('handlePause') &&
        panel.includes('enqueueDeleteFromExitJob') &&
        panel.includes('enqueueSetPhotoFromCreateJob') &&
        panel.includes('tryRunEnqueuedAutomationJob') &&
        table.includes('jobQueueCanRun') &&
        table.includes('jobQueueCanPause') &&
        ui.includes('jobQueueCanRun') &&
        account.includes('JobQueueSetupHost') &&
        account.includes("mode === 'missing' ? 'join'") &&
        account.includes("mode === 'notAdmin' ? 'set_admin'") &&
        account.includes("preferredExitGroupTab={setupTask === 'exit_delete_group' ? 'junk'")
      );
    })(),
  },
  {
    name: 'Delete from VIEW: enqueue + auto-run + close modal',
    ok: (() => {
      const global = read('src/components/group-monitoring/OperationsGlobalJobQueuePanel.tsx');
      const table = read('src/components/group-monitoring/OperationsJobQueueTable.tsx');
      return (
        global.includes('tryRunEnqueuedAutomationJob(result.jobId)') &&
        global.includes('QueueFromViewResult') &&
        !global.includes("'RUN_FAILED'") &&
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
      const hook = read('src/hooks/useJobQueueSetupEnqueue.ts');
      return (
        map.includes('NO_LEFT_GROUPS') &&
        map.includes('NO_CREATED_GROUPS') &&
        create.includes('queueError') &&
        create.includes('mapEnqueueJobQueueError') &&
        detail.includes('queueError') &&
        hook.includes('mapEnqueueJobQueueError')
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
    name: 'WA leave: page.evaluate leave (no Node getChatById) + exitError VIEW',
    ok: (() => {
      const leave = read('electron/main/automation/waLeaveGroup.ts');
      const tg = read('electron/main/automation/tgAutomationClient.ts');
      const ui = read('src/lib/operationsJobQueueUi.ts');
      const types = read('src/types/automationJob.ts');
      return (
        leave.includes('leaveViaPageEvaluate') &&
        leave.includes('WAWebExitGroupAction') &&
        !leave.includes('client.getChatById') &&
        !leave.includes('client.getChats') &&
        leave.includes('exitError') &&
        leave.includes('withDetachedFrameRetry') &&
        tg.includes('exitError') &&
        ui.includes('exitError') &&
        types.includes('exitError?: string')
      );
    })(),
  },
  {
    name: 'WA delete chat: page.evaluate wipe (sendDeleteChat) no Node getChatById',
    ok: (() => {
      const del = read('electron/main/automation/waDeleteGroupChat.ts');
      return (
        del.includes('wipeViaPageEvaluate') &&
        del.includes('sendDeleteChat') &&
        del.includes('sendClearChat') &&
        !del.includes('client.getChatById') &&
        del.includes('groupOutcomes')
      );
    })(),
  },
  {
    name: 'Batch create: one execute capped to perRun (no multi-slice)',
    ok: (() => {
      const wa = read('electron/main/automation/waAutomation.ts');
      const tg = read('electron/main/automation/tgAutomationClient.ts');
      return (
        wa.includes('const totalTarget = Math.min(totalRequested, perRun)') &&
        tg.includes('const totalTarget = Math.min(totalRequested, perRun)') &&
        !wa.includes('createdBeforeSlice') &&
        !tg.includes('createdBeforeSlice')
      );
    })(),
  },
  {
    name: 'Create Group: Creator role + daily hide + max 25',
    ok: (() => {
      const role = read('src/config/accountOpsRole.ts');
      const eligibility = read('src/lib/createGroupAccountEligibility.ts');
      const addBar = read('src/components/group-monitoring/OperationsJobQueueAddBar.tsx');
      const addModal = read('src/components/group-monitoring/AddAccountModal.tsx');
      const editModal = read('src/components/group-monitoring/EditAccountModal.tsx');
      const cells = read('src/components/group-monitoring/AccountMonitoringCells.tsx');
      const worker = read('src/config/workerPlatformSettings.ts');
      return (
        role.includes('CREATE_GROUP_MAX_PER_ACCOUNT_RUN = 25') &&
        role.includes("'gcs'") &&
        role.includes("'master'") &&
        eligibility.includes('shouldHideCreateAccountFromSelect') &&
        eligibility.includes('executedToday') &&
        addBar.includes('isEligibleCreateGroupAccount') &&
        addBar.includes('create_group') &&
        addModal.includes('AccountOpsRoleSelect') &&
        addModal.includes('opsRoleRequired') &&
        editModal.includes('AccountOpsRoleSelect') &&
        cells.includes('AccountOpsRoleCell') &&
        cells.includes('brand-col-cell--role') &&
        worker.includes("action === 'create_group'") &&
        worker.includes('jitterPercent = Math.max(jitterPercent, 40)')
      );
    })(),
  },
  {
    name: 'Batch create: withJobTimeoutSettle wrapper',
    ok: (() => {
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const timeout = read('electron/main/automation/promiseTimeout.ts');
      return (
        runner.includes('async function runCreateGroupBatchJob') &&
        runner.includes('withJobTimeoutSettle') &&
        timeout.includes('withJobTimeoutSettle') &&
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
    name: 'Parallel execute: max 10 per platform (WA/TG separate pools)',
    ok: (() => {
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const store = read('electron/main/automation/jobQueueStore.ts');
      const pool = read('electron/main/automation/executeSlotPool.ts');
      const conc = read('electron/main/automation/jobQueueConcurrency.ts');
      const policy = read('src/config/deviceConcurrencyPolicy.ts');
      const waPool = read('electron/main/platformLogin/waBrowserPool.ts');
      const tgSlots = read('electron/main/platformLogin/tgExecuteSlots.ts');
      const freeFn = store.slice(
        store.indexOf('export function countFreeExecuteSlots'),
        store.indexOf('export function pickQueuedJobsForDispatch'),
      );
      return (
        policy.includes('DEFAULT_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM = 10') &&
        policy.includes('HARD_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM = 10') &&
        waPool.includes('DEFAULT_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM') &&
        tgSlots.includes('DEFAULT_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM') &&
        conc.includes('getMaxWaBrowserSlots') &&
        conc.includes('getMaxTgExecuteSlots') &&
        pool.includes('getMaxTgExecuteSlots') &&
        pool.includes('byPlatform') &&
        pool.includes('drainExecuteSlotFifo(platform)') &&
        runner.includes('waitForExecuteSlot') &&
        runner.includes('job.platform') &&
        store.includes('countFreeExecuteSlots') &&
        store.includes('getExecuteSlotStats') &&
        freeFn.includes('maxConcurrent - stats.activeCount') &&
        !freeFn.includes('queuedCount')
      );
    })(),
  },
  {
    name: 'Scrape Now + job berbagi slot pool (kind scraper|job, FIFO drain)',
    ok: (() => {
      const pool = read('electron/main/automation/executeSlotPool.ts');
      const sync = read('src/hooks/useAccountSyncFlow.ts');
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const client = read('src/lib/executeSlotClient.ts');
      return (
        pool.includes("ExecuteSlotKind = 'sync' | 'scraper' | 'job'") &&
        sync.includes("acquireExecuteSlot(account.id, 'scraper'") &&
        runner.includes("waitForExecuteSlot(job.accountId, 'job'") &&
        client.includes('acquireOrWait') &&
        /fifoWaiters\.push[\s\S]{0,120}drainExecuteSlotFifo/.test(pool) &&
        pool.includes('deferred.push(next)')
      );
    })(),
  },
  {
    name: 'Runner: claim running sebelum wait slot (anti double-dispatch)',
    ok: (() => {
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const store = read('electron/main/automation/jobQueueStore.ts');
      const timeout = read('electron/main/automation/promiseTimeout.ts');
      const claimIdx = runner.indexOf('if (!markJobRunning(job.id))');
      const waitIdx = runner.indexOf('await waitForExecuteSlot(job.accountId');
      return (
        claimIdx >= 0 &&
        waitIdx > claimIdx &&
        store.includes('releaseClaimedJobToQueue') &&
        store.includes('demoteRunningJobToPaused') &&
        store.includes('touchProgress') &&
        store.includes('EXIT_DELETE_LEGACY_DISABLED') &&
        timeout.includes('withJobTimeoutSettle') &&
        runner.includes('withJobTimeoutSettle') &&
        runner.includes('signalJobStop')
      );
    })(),
  },
  {
    name: 'WA set_admin batch: groupOutcomes + cooperative stop',
    ok: (() => {
      const wa = read('electron/main/automation/waAutomation.ts');
      const start = wa.indexOf("if (payload.action === 'set_admin' && adminGroups.length > 0)");
      const body = wa.slice(start, start + 2200);
      return (
        body.includes('adminStatus') &&
        body.includes('groupOutcomes') &&
        body.includes('isJobStopRequested(payload.jobId)')
      );
    })(),
  },
  {
    name: 'Pause/resume: persist outcomes + create resume slice (anti-duplikat)',
    ok: (() => {
      const helpers = read('electron/main/automation/jobQueueOutcomeHelpers.ts');
      const runner = read('electron/main/automation/jobQueueRunner.ts');
      const store = read('electron/main/automation/jobQueueStore.ts');
      return (
        helpers.includes('resolveCreateResumeSlice') &&
        helpers.includes('filterGroupsNotDone') &&
        helpers.includes('countCreatedGroupOutcomes') &&
        runner.includes('resolveCreateResumeSlice') &&
        runner.includes('attachJobGroupOutcomes') &&
        runner.includes('demoteRunningJobToPaused(job.id') &&
        store.includes('attachJobGroupOutcomes') &&
        store.includes('countCreatedGroupOutcomes')
      );
    })(),
  },
  {
    name: 'TG batch: cooperative stop + set_admin adminStatus outcomes',
    ok: (() => {
      const tg = read('electron/main/automation/tgAutomationClient.ts');
      return (
        tg.includes('peekJobStopRequest') &&
        tg.includes('isJobStopRequested') &&
        tg.includes("errorCode: 'JOB_STOPPED'") &&
        tg.includes("adminStatus: 'promoted'") &&
        tg.includes("adminStatus: 'failed'") &&
        tg.includes('groupOutcomes')
      );
    })(),
  },
  {
    name: 'VIEW set_admin: status dari adminStatus outcomes',
    ok: (() => {
      const ui = read('src/lib/operationsJobQueueUi.ts');
      const en = read('src/i18n/locales/en.ts');
      return (
        ui.includes('adminStatusPromoted') &&
        ui.includes('adminStatusFailed') &&
        ui.includes("job.action === 'set_admin'") &&
        ui.includes('job.payload.groupOutcomes') &&
        en.includes('adminStatusPromoted') &&
        en.includes('adminStatusFailed')
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
    name: 'CTA To prep: klik angka → modal Create + pilih Master (bukan AddBar navigate)',
    ok: (() => {
      const card = read('src/components/group-monitoring/AccountBrandCard.tsx');
      const meta = read('src/components/group-monitoring/OperationsBrandHeaderMeta.tsx');
      const host = read('src/components/group-monitoring/JobQueueSetupHost.tsx');
      const modal = read('src/components/group-monitoring/OperationsJobQueueSetupModal.tsx');
      return (
        meta.includes('stockToPrepare > 1') &&
        meta.includes('brand-metric-hit') &&
        meta.includes('onCreateGroup') &&
        !meta.includes('operations-brand-create-cta') &&
        !meta.includes('tabCreateGroup') &&
        card.includes('createAccountCandidates') &&
        card.includes('JobQueueSetupHost') &&
        card.includes('taskType="create_group"') &&
        card.includes('preferredCreateTotal') &&
        !card.includes('dispatchJobQueueFocus') &&
        host.includes('createAccountCandidates') &&
        host.includes('pickCreateAccountInModal') &&
        modal.includes('buildCreateGroupAccountSelectModel') &&
        modal.includes('createAccountCandidates') &&
        modal.includes('handleCreateTotalToCreateChange') &&
        modal.includes('createTotalLimitAlertOpen') &&
        modal.includes('createTotalInvalid') &&
        !modal.includes('createPerRunHint')
      );
    })(),
  },
  {
    name: 'Create Master select: satu helper AddBar + modal (anti overlap used-today)',
    ok: (() => {
      const elig = read('src/lib/createGroupAccountEligibility.ts');
      const add = read('src/components/group-monitoring/OperationsJobQueueAddBar.tsx');
      const modal = read('src/components/group-monitoring/OperationsJobQueueSetupModal.tsx');
      return (
        elig.includes('buildCreateGroupAccountSelectModel') &&
        elig.includes('shouldHideCreateAccountFromSelect') &&
        add.includes('buildCreateGroupAccountSelectModel') &&
        modal.includes('buildCreateGroupAccountSelectModel')
      );
    })(),
  },
  {
    name: 'Create total: hybrid limit (modal blok) — no caption createPerRunHint',
    ok: (() => {
      const modal = read('src/components/group-monitoring/OperationsJobQueueSetupModal.tsx');
      const en = read('src/i18n/locales/en.ts');
      const css = read('src/index.css');
      const validate = read('src/lib/createGroupSetupValidation.ts');
      return (
        modal.includes('handleCreateTotalToCreateChange') &&
        modal.includes('createTotalLimitAlertOpen') &&
        modal.includes('createTotalInvalid') &&
        !modal.includes('createPerRunHint') &&
        !en.includes('createPerRunHint') &&
        !css.includes('.operations-job-queue-hint') &&
        validate.includes('createTotalInvalid') &&
        validate.includes('total > maxPerRun')
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
      const autoScrape = read('src/lib/runAutoAccountScrape.ts');
      return (
        client.includes('enqueueAutomationJob') &&
        client.includes('enqueueAndTryRunAutomationJob') &&
        client.includes('resolveAccountExecuteBlock') &&
        client.includes('isHeavyDeviceExecuteBlockedForAccount') &&
        !client.includes('clearCompletedAutomationJobs') &&
        !client.includes('isHeavyDeviceExecuteBlocked()') &&
        sync.includes('resolveAccountExecuteBlock') &&
        autoScrape.includes('waitUntilAutoScrapeAccountReady') &&
        autoSync.includes('runAutoAccountScrape')
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
