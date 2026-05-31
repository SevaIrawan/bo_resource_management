import { PlatformLoginModal } from '@/components/group-monitoring/PlatformLoginModal';
import { SyncScrapeConfirmModal } from '@/components/group-monitoring/SyncScrapeConfirmModal';
import { SyncSessionModal } from '@/components/group-monitoring/SyncSessionModal';
import { MissingPhoneModal } from '@/components/group-monitoring/MissingPhoneModal';
import { SyncAlertModal } from '@/components/group-monitoring/SyncAlertModal';
import { PHONE_COLUMN_MIGRATION_HINT } from '@/lib/dbPhoneSchema';
import { PLATFORM_SESSION_RLS_HINT } from '@/lib/platformSessions';
import { useLanguage } from '@/hooks/useLanguage';
import {
  parseSyncMetricsPayload,
  resolveSyncFlowMessage,
  syncConnectedSummaryMessage,
  syncSessionValidMessage,
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
    confirmScrape,
    confirmScrapePrompt,
    dismissScrapePrompt,
    openScraperFromSessionValid,
    handleLoginSuccess,
    handleSavePhoneAndSync,
    closeFlow,
    phoneSaving,
    syncMessage,
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

      <SyncSessionModal
        open={step === 'session-valid'}
        message={(() => {
          const platform = target?.account.platform;
          if (!platform) return t('groupMonitoring.sync.sessionValidMessageTg');
          const metrics = parseSyncMetricsPayload(syncMessage);
          if (metrics) {
            return syncConnectedSummaryMessage(platform, metrics, t);
          }
          return syncSessionValidMessage(platform, t);
        })()}
        accountName={target?.account.accountName ?? ''}
        platform={target?.account.platform}
        onClose={closeFlow}
        onRunScraper={openScraperFromSessionValid}
      />

      <SyncScrapeConfirmModal
        open={step === 'confirm-scrape'}
        accountName={target?.account.accountName ?? ''}
        platform={target?.account.platform}
        onClose={closeFlow}
        onConfirm={confirmScrape}
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
        open={step === 'platform-login'}
        platform={activePlatform}
        accountName={target?.account.accountName ?? ''}
        sessionId={target?.account.id ?? ''}
        dbAccountId={target?.dbAccountId}
        phoneNumber={target?.account.phoneNumber ?? ''}
        loginHint={resolveSyncFlowMessage(syncMessage, activePlatform, t)}
        attemptRestore={
          syncMessage !== 'SESSION_INVALID_RELOGIN' &&
          syncMessage !== 'SESSION_INVALID_FORCE_SCRAPER'
        }
        onClose={closeFlow}
        onLoginSuccess={handleLoginSuccess}
      />
    </>
  );
}
