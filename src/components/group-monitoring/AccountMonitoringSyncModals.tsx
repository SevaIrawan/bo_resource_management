import { PlatformLoginModal } from '@/components/group-monitoring/PlatformLoginModal';
import { SyncScrapeConfirmModal } from '@/components/group-monitoring/SyncScrapeConfirmModal';
import { SyncResumeEmptyModal } from '@/components/group-monitoring/SyncResumeEmptyModal';
import { MissingPhoneModal } from '@/components/group-monitoring/MissingPhoneModal';
import { SyncAlertModal } from '@/components/group-monitoring/SyncAlertModal';
import { PHONE_COLUMN_MIGRATION_HINT } from '@/lib/dbPhoneSchema';
import { PLATFORM_SESSION_RLS_HINT } from '@/lib/platformSessions';
import { useLanguage } from '@/hooks/useLanguage';
import {
  resolveSyncFlowMessage,
} from '@/lib/platformSyncCopy';
import type { useAccountSyncFlow } from '@/hooks/useAccountSyncFlow';

type SyncFlow = ReturnType<typeof useAccountSyncFlow>;

interface AccountMonitoringSyncModalsProps {
  sync: SyncFlow;
}

function resolveAlertMessage(
  code: string | null,
  t: (key: string) => string,
): string {
  if (!code) return '';

  if (code === 'SUPABASE_NOT_CONFIGURED') {
    return t('groupMonitoring.sync.supabaseNotConfigured');
  }
  if (code === 'SCRAPER_DESKTOP_REQUIRED') {
    return t('groupMonitoring.sync.scraperDesktopRequired');
  }
  if (code === 'SCRAPER_NO_GROUPS' || code.startsWith('SCRAPER_NO_GROUPS:')) {
    if (code.includes(':')) return code.replace('SCRAPER_NO_GROUPS: ', '');
    return t('groupMonitoring.sync.scraperNoGroups');
  }
  if (code.startsWith('WA_CLIENT_NOT_READY') || code.startsWith('WA_NOT_CONNECTED')) {
    return code.replace(/^WA_[A-Z_]+:\s*/, '');
  }
  if (code === 'AUTH_REQUIRED') {
    return t('groupMonitoring.sync.authRequired');
  }
  if (code === 'SYNC_FAILED') {
    return t('groupMonitoring.sync.syncFailed');
  }
  if (code === 'SYNC_TIMED_OUT') {
    return t('groupMonitoring.sync.syncTimedOut');
  }
  if (code === 'SESSION_WARM_PENDING') {
    return t('groupMonitoring.sync.sessionWarmPending');
  }
  if (code === 'SCRAPER_WRITE_FAILED' || code === 'SCRAPER_FAILED') {
    return t('groupMonitoring.sync.scraperFailed');
  }
  if (code.startsWith('SCRAPER_DB_WRITE:')) {
    return code.replace('SCRAPER_DB_WRITE: ', '');
  }
  if (code.startsWith('PHONE_COLUMN_MISSING:')) {
    return code.replace('PHONE_COLUMN_MISSING: ', '');
  }
  if (code.includes(PHONE_COLUMN_MIGRATION_HINT)) {
    return code;
  }
  if (code.includes(PLATFORM_SESSION_RLS_HINT)) {
    return code.replace('PLATFORM_SESSION_RLS: ', '');
  }
  return code;
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
    handleLoginSuccess,
    handleSavePhoneAndSync,
    closeFlow,
    phoneSaving,
    syncMessage,
    loginModalEpoch,
  } = sync;

  const alertMessage = resolveAlertMessage(checkError, t);

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
        open={step === 'sync-error'}
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
        postLogin
        onClose={dismissScrapePrompt}
        onConfirm={confirmScrapePrompt}
      />

      <PlatformLoginModal
        key={`login-${target?.account.id ?? 'none'}-${loginModalEpoch}`}
        open={step === 'platform-login'}
        platform={activePlatform}
        accountName={target?.account.accountName ?? ''}
        sessionId={target?.account.id ?? ''}
        dbAccountId={target?.dbAccountId}
        phoneNumber={target?.account.phoneNumber ?? ''}
        loginHint={resolveSyncFlowMessage(syncMessage, activePlatform, t)}
        attemptRestore={false}
        onClose={closeFlow}
        onLoginSuccess={handleLoginSuccess}
      />
    </>
  );
}
