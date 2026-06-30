import { PlatformLoginModal } from '@/components/group-monitoring/PlatformLoginModal';
import { ScrapeCancelConfirmModal } from '@/components/group-monitoring/ScrapeCancelConfirmModal';
import { SyncScrapeConfirmModal } from '@/components/group-monitoring/SyncScrapeConfirmModal';
import { SyncResumeEmptyModal } from '@/components/group-monitoring/SyncResumeEmptyModal';
import { MissingPhoneModal } from '@/components/group-monitoring/MissingPhoneModal';
import { SyncAlertModal } from '@/components/group-monitoring/SyncAlertModal';
import { resolveSyncFlowAlertMessage } from '@/lib/scrapeErrorUi';
import { useLanguage } from '@/hooks/useLanguage';
import {
  resolveSyncFlowMessage,
} from '@/lib/platformSyncCopy';
import type { useAccountSyncFlow } from '@/hooks/useAccountSyncFlow';

type SyncFlow = ReturnType<typeof useAccountSyncFlow>;

interface AccountMonitoringSyncModalsProps {
  sync: SyncFlow;
}

export function AccountMonitoringSyncModals({ sync }: AccountMonitoringSyncModalsProps) {
  const { t } = useLanguage();
  const {
    step,
    target,
    checkError,
    activePlatform,
    confirmScrapePrompt,
    dismissScrapePrompt,
    confirmCancelScrape,
    dismissCancelScrapeConfirm,
    dismissScrapeCancelled,
    handleLoginSuccess,
    handleLoginFatalError,
    handleSavePhoneAndSync,
    closeFlow,
    phoneSaving,
    syncMessage,
    loginHintCode,
    loginModalEpoch,
    postLoginCountsReady,
  } = sync;

  const alertMessage = resolveSyncFlowAlertMessage(checkError, t, target?.account.platform);

  return (
    <>
      <MissingPhoneModal
        open={step === 'missing-phone'}
        accountName={target?.account.accountName ?? ''}
        initialPhone={target?.account.phoneNumber ?? ''}
        saving={phoneSaving}
        error={checkError && step === 'missing-phone' ? alertMessage : null}
        onClose={closeFlow}
        onSave={(phone) => void handleSavePhoneAndSync(phone)}
      />

      <SyncAlertModal
        open={step === 'sync-error' && alertMessage.trim().length > 0}
        message={alertMessage}
        accountName={target?.account.accountName}
        platform={target?.account.platform}
        onClose={closeFlow}
      />

      <SyncResumeEmptyModal
        open={step === 'resume-empty'}
        accountName={target?.account.accountName ?? ''}
        platform={target?.account.platform}
        onClose={closeFlow}
      />

      <SyncScrapeConfirmModal
        open={step === 'scrape-prompt'}
        accountName={target?.account.accountName ?? ''}
        platform={target?.account.platform}
        postLogin={Boolean(target?.scrapePromptPostLogin)}
        postLoginCountsReady={postLoginCountsReady}
        onClose={dismissScrapePrompt}
        onConfirm={confirmScrapePrompt}
      />

      <ScrapeCancelConfirmModal
        open={step === 'scrape-cancel-confirm'}
        accountName={target?.account.accountName ?? ''}
        platform={target?.account.platform}
        onClose={dismissCancelScrapeConfirm}
        onConfirm={() => void confirmCancelScrape()}
      />

      <SyncAlertModal
        open={step === 'scrape-cancelled'}
        tone="neutral"
        message={t('groupMonitoring.sync.scrapeCancelledMessage')}
        accountName={target?.account.accountName}
        platform={target?.account.platform}
        onClose={dismissScrapeCancelled}
      />

      {activePlatform && step === 'platform-login' ? (
        <PlatformLoginModal
          key={`login-${target?.account.id ?? 'none'}-${loginModalEpoch}`}
          open
          platform={activePlatform}
          accountName={target?.account.accountName ?? ''}
          sessionId={target?.account.id ?? ''}
          dbAccountId={target?.dbAccountId}
          phoneNumber={target?.account.phoneNumber ?? ''}
          groupsCurrent={target?.account.groupsCurrent}
          groupsTotal={target?.account.groupsTotal}
          loginHint={resolveSyncFlowMessage(loginHintCode ?? syncMessage, activePlatform, t)}
          attemptRestore={false}
          devicePrepared
          onClose={closeFlow}
          onLoginFatalError={handleLoginFatalError}
          onLoginSuccess={handleLoginSuccess}
        />
      ) : null}
    </>
  );
}
