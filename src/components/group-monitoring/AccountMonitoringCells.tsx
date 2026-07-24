import { useMemo, useState } from 'react';
import { RefreshCw, Pencil, X } from 'lucide-react';
import { PermissionLockedButton } from '@/components/ui/PermissionLockedButton';
import { BrandImage } from '@/components/brand/BrandImage';
import {
  GroupLinksModal,
  type AccountMetricGroupsMode,
} from '@/components/group-monitoring/GroupLinksModal';
import { JobQueueSetupHost } from '@/components/group-monitoring/JobQueueSetupHost';
import {
  readTelegramWorkerSettings,
  readWhatsAppWorkerSettings,
} from '@/config/workerPlatformSettings';
import { accountNeedsRelogin } from '@/lib/platformSyncCopy';
import { computeAccountGapMetrics } from '@/lib/accountGapMetrics';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { formatLastSyncAt } from '@/lib/formatLastSync';
import type { AccountBrandEmptySlot, AccountBrandRow } from '@/types/accountMonitoringUi';
import { ScraperStatusMarquee } from '@/components/group-monitoring/ScraperStatusMarquee';
import { resolveScrapeBarDisplay } from '@/lib/scrapeProgressDisplay';
import {
  resolveAccountActionColumn,
  resolveActiveProcessIntent,
} from '@/lib/accountActionColumn';
import type { JobQueueTaskType } from '@/lib/operationsJobQueueUi';
import type { UiScrapeProgress } from '@/types/scrapeProgress';

export function PlatformBadge({ platform }: { platform: AccountBrandRow['platform'] }) {
  const asset = platform === 'whatsapp' ? 'whatsapp' : 'telegram';

  return (
    <span
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
        platform === 'whatsapp' ? 'bg-wa/15' : 'bg-tg/15',
      )}
    >
      <BrandImage asset={asset} alt={platform} className="h-4 w-4" />
    </span>
  );
}

export function SessionBadge({ status }: { status: AccountBrandRow['sessionStatus'] }) {
  const { t } = useLanguage();
  const isValid = status === 'valid';

  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        isValid ? 'bg-wa/15 text-wa' : 'bg-danger/15 text-danger',
      )}
    >
      {isValid
        ? t('groupMonitoring.accountCard.sessionValid')
        : t('groupMonitoring.accountCard.sessionInvalid')}
    </span>
  );
}

function AccountOpsRoleCell({ role }: { role: AccountBrandRow['opsRole'] }) {
  const { t } = useLanguage();
  const isMaster = role === 'master';

  return (
    <span className="brand-account-role-text">
      {isMaster
        ? t('groupMonitoring.accountCard.opsRoleMaster')
        : t('groupMonitoring.accountCard.opsRoleGcs')}
    </span>
  );
}

function SessionClearButton({
  onClear,
  loading = false,
  operateLocked = false,
}: {
  onClear?: () => void;
  loading?: boolean;
  operateLocked?: boolean;
}) {
  const { t } = useLanguage();
  const visibleClass = loading ? 'brand-session-clear-btn--visible' : '';

  if (operateLocked) {
    return (
      <PermissionLockedButton
        className={cn('brand-session-clear-btn permission-locked-btn--clear-session', visibleClass)}
        title={t('groupMonitoring.accountCard.clearSessionAria')}
      />
    );
  }

  if (!onClear) return null;

  return (
    <button
      type="button"
      className={cn('brand-session-clear-btn', visibleClass)}
      title={t('groupMonitoring.accountCard.clearSessionAria')}
      aria-label={t('groupMonitoring.accountCard.clearSessionAria')}
      disabled={loading}
      onClick={(event) => {
        event.stopPropagation();
        onClear();
      }}
    >
      <X
        className={cn('h-3 w-3', loading && 'brand-session-clear-btn--spin')}
        strokeWidth={2.5}
      />
    </button>
  );
}

function SessionColumnCell({
  row,
  isPending,
  onClearSession,
  clearSessionLoading = false,
  operateLocked = false,
  hideClearButton = false,
}: {
  row: AccountBrandRow;
  isPending: boolean;
  onClearSession?: () => void;
  clearSessionLoading?: boolean;
  operateLocked?: boolean;
  hideClearButton?: boolean;
}) {
  const { t } = useLanguage();

  if (isPending) {
    return <span className="brand-account-slot-muted text-xs">—</span>;
  }

  if (row.actionProcess === 'session_check') {
    const label = t('groupMonitoring.accountCard.sessionChecking');

    return (
      <div className="brand-session-cell-stack">
        <ScraperStatusMarquee label={label} />
      </div>
    );
  }

  const showClear =
    !hideClearButton &&
    row.sessionStatus === 'valid' &&
    !row.actionProcess &&
    Boolean(onClearSession || operateLocked);

  return (
    <div className="brand-session-cell-inline">
      <SessionBadge status={row.sessionStatus} />
      {showClear ? (
        <SessionClearButton
          onClear={onClearSession}
          loading={clearSessionLoading}
          operateLocked={operateLocked}
        />
      ) : null}
    </div>
  );
}

function ActionColumnCell({
  row,
  isPending,
  operateLocked,
  activeProcessIntent = null,
  onCancelScrape,
}: {
  row: AccountBrandRow;
  isPending: boolean;
  operateLocked: boolean;
  activeProcessIntent?: 'sync' | 'scraper' | null;
  onCancelScrape?: () => void;
}) {
  const { t } = useLanguage();
  const kind = resolveAccountActionColumn(row, activeProcessIntent);

  if (isPending) {
    return <span className="brand-account-slot-muted text-xs">—</span>;
  }

  if (kind === 'none') {
    return null;
  }

  if (kind === 'proc-sync') {
    return (
      <span className="brand-action-process" aria-live="polite">
        {t('groupMonitoring.accountCard.procSync')}
      </span>
    );
  }

  if (kind === 'cancel-scrape') {
    if (operateLocked) {
      return (
        <PermissionLockedButton
          variant="text"
          className="brand-card-action-btn brand-card-action-btn--nowrap brand-card-action-btn--cancel-scrape"
        >
          {t('groupMonitoring.accountCard.cancelScrape')}
        </PermissionLockedButton>
      );
    }

    return (
      <button
        type="button"
        className="brand-card-action-btn brand-card-action-btn--nowrap brand-card-action-btn--cancel-scrape"
        title={t('groupMonitoring.accountCard.cancelScrapeHint')}
        onClick={() => onCancelScrape?.()}
      >
        {t('groupMonitoring.accountCard.cancelScrape')}
      </button>
    );
  }

  if (kind === 'not-aligned') {
    return (
      <span className="brand-remark-status brand-remark-status--not-aligned text-xs font-semibold">
        {t('groupMonitoring.accountCard.remarkNotAligned')}
      </span>
    );
  }

  return (
    <span className="brand-remark-status brand-remark-status--aligned text-xs font-semibold">
      {t('groupMonitoring.accountCard.remarkAligned')}
    </span>
  );
}

/** Gap: >0 merah + underline klikable; 0 → em dash abu, tidak klik. */
function GapCountLabel({ gap }: { gap: number }) {
  const safe = Math.max(0, gap);
  if (safe === 0) {
    return <span className="brand-gap-metric brand-gap-metric--none text-xs tabular-nums">-</span>;
  }
  return (
    <span className="brand-gap-metric brand-gap-metric--link text-xs tabular-nums">
      {safe}
    </span>
  );
}

function MetricGapButton({
  gap,
  title,
  onClick,
}: {
  gap: number;
  title: string;
  onClick: () => void;
}) {
  const safe = Math.max(0, gap);
  if (safe === 0) {
    return <GapCountLabel gap={0} />;
  }
  return (
    <button type="button" className="brand-metric-hit" title={title} onClick={onClick}>
      <GapCountLabel gap={safe} />
    </button>
  );
}

function LastUpdateColumnCell({
  row,
  scraperLoading,
  scrapeProgress,
}: {
  row: AccountBrandRow;
  scraperLoading: boolean;
  scrapeProgress?: UiScrapeProgress | null;
}) {
  const { t, locale } = useLanguage();
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-GB';
  const isRunning = scraperLoading || row.actionProcess === 'scraper';
  const canShowLastUpdate =
    !isRunning && row.syncState === 'synced' && Boolean(row.lastSyncAt);

  if (accountNeedsRelogin(row)) {
    return (
      <span className="brand-last-update-hint brand-account-slot-muted">
        {t('groupMonitoring.accountCard.useSyncToLogin')}
      </span>
    );
  }

  if (isRunning) {
    const fallbackLabel = t('groupMonitoring.accountCard.scraperRunning');
    const bar = resolveScrapeBarDisplay(row, scrapeProgress, fallbackLabel);

    return (
      <div className="brand-last-update-cell-stack">
        <div
          className="brand-last-update-progress"
          role="progressbar"
          aria-valuenow={bar.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-busy="true"
          aria-label={bar.label}
        >
          <div className="brand-last-update-progress-bar">
            <div
              className="brand-last-update-progress-fill"
              style={{ width: `${bar.percent}%` }}
            />
          </div>
          <span className="brand-last-update-progress-pct">
            {bar.current}/{bar.total}
          </span>
        </div>
        <ScraperStatusMarquee label={bar.label} />
      </div>
    );
  }

  if (canShowLastUpdate) {
    return (
      <div className="brand-last-update-cell-stack">
        <time className="brand-last-update-time" dateTime={row.lastSyncAt ?? undefined}>
          {formatLastSyncAt(row.lastSyncAt, dateLocale)}
        </time>
      </div>
    );
  }

  return <span className="brand-account-slot-muted text-xs">—</span>;
}

function AccountSyncIcon({
  onSync,
  loading = false,
  operateLocked = false,
}: {
  onSync?: () => void;
  loading?: boolean;
  operateLocked?: boolean;
}) {
  const { t } = useLanguage();

  if (operateLocked) {
    return (
      <PermissionLockedButton
        className="brand-account-sync-btn"
        title={t('groupMonitoring.accountCard.syncAccountTooltip')}
      />
    );
  }

  return (
    <button
      type="button"
      className="brand-account-sync-btn"
      title={t('groupMonitoring.accountCard.syncAccountTooltip')}
      aria-label={t('groupMonitoring.accountCard.syncAccountTooltip')}
      onClick={onSync}
      disabled={loading}
    >
      <RefreshCw
        className={cn('h-3.5 w-3.5', loading && 'brand-account-sync-btn--spin')}
        strokeWidth={2}
      />
    </button>
  );
}

function AccountEditSlotIcon({
  onEdit,
  structureLocked = false,
}: {
  onEdit?: () => void;
  structureLocked?: boolean;
}) {
  const { t } = useLanguage();

  if (structureLocked) {
    return (
      <PermissionLockedButton
        className="brand-account-edit-btn permission-locked-btn--edit"
        title={t('groupMonitoring.accountCard.editAccountAria')}
      />
    );
  }

  if (!onEdit) return null;

  return (
    <button
      type="button"
      className="brand-account-edit-btn"
      title={t('groupMonitoring.accountCard.editAccountAria')}
      aria-label={t('groupMonitoring.accountCard.editAccountAria')}
      onClick={(event) => {
        event.stopPropagation();
        onEdit();
      }}
    >
      <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}

function AccountRemoveSlotIcon({
  onRemove,
  structureLocked = false,
}: {
  onRemove?: () => void;
  structureLocked?: boolean;
}) {
  const { t } = useLanguage();

  if (structureLocked) {
    return (
      <PermissionLockedButton
        className="brand-account-remove-btn permission-locked-btn--remove"
        title={t('groupMonitoring.accountCard.removeFromSlotAria')}
      />
    );
  }

  if (!onRemove) return null;

  return (
    <button
      type="button"
      className="brand-account-remove-btn"
      title={t('groupMonitoring.accountCard.removeFromSlotAria')}
      aria-label={t('groupMonitoring.accountCard.removeFromSlotAria')}
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
    >
      <X className="h-3.5 w-3.5" strokeWidth={2.5} />
    </button>
  );
}

﻿export function AccountTableRow({
  row,
  layout = 'brandCard',
  showAction = true,
  brandAccounts,
  onSync,
  onCancelScrape,
  onRemoveFromSlot,
  onEditAccount,
  onClearSession,
  canOperatePlatform = true,
  canManageStructure = true,
  syncLoading = false,
  scraperLoading = false,
  clearSessionLoading = false,
  scrapeProgress = null,
}: {
  row: AccountBrandRow;
  layout?: 'brandCard' | 'flat';
  showAction?: boolean;
  brandAccounts?: AccountBrandRow[];
  onSync?: () => void;
  onCancelScrape?: () => void;
  onRemoveFromSlot?: () => void;
  onEditAccount?: () => void;
  onClearSession?: () => void;
  canOperatePlatform?: boolean;
  canManageStructure?: boolean;
  syncLoading?: boolean;
  scraperLoading?: boolean;
  clearSessionLoading?: boolean;
  scrapeProgress?: UiScrapeProgress | null;
}) {
  const { t } = useLanguage();
  const [linksOpen, setLinksOpen] = useState(false);
  const [linksMode, setLinksMode] = useState<AccountMetricGroupsMode>('account');
  const [setupTask, setSetupTask] = useState<JobQueueTaskType | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [pendingSetupTask, setPendingSetupTask] = useState<JobQueueTaskType | null>(null);
  const [setupFeedback, setSetupFeedback] = useState<string | null>(null);
  const isPending = row.syncState === 'pending';
  const gaps = computeAccountGapMetrics(row);
  const activeProcessIntent = resolveActiveProcessIntent(row, {
    sync: syncLoading,
    scraper: scraperLoading,
  });
  const isProcessing = row.actionProcess !== null || activeProcessIntent !== null;

  const isFlatLayout = layout === 'flat';
  const operateLocked = !canOperatePlatform;
  const structureLocked = !canManageStructure;
  const showRemoveHover =
    !isFlatLayout &&
    (Boolean(onRemoveFromSlot) || Boolean(onEditAccount) || structureLocked) &&
    !isPending &&
    !isProcessing;
  const showClearSessionHover =
    !isFlatLayout &&
    (Boolean(onClearSession) || operateLocked) &&
    !isPending &&
    !isProcessing &&
    row.sessionStatus === 'valid';

  const platformPeers = useMemo(() => {
    const peers = (brandAccounts ?? []).filter((a) => a.platform === row.platform);
    return peers.length > 0 ? peers : [row];
  }, [brandAccounts, row]);

  const validPeers = useMemo(
    () => platformPeers.filter((a) => a.sessionStatus === 'valid'),
    [platformPeers],
  );

  const setAdminOwnerCandidates = useMemo(
    () => validPeers.filter((a) => a.id !== row.id),
    [row.id, validPeers],
  );

  function openMetricModal(mode: AccountMetricGroupsMode) {
    if (isPending) return;
    if (mode === 'account' && row.groupsCurrent <= 0) return;
    if (mode === 'junk' && gaps.junk <= 0) return;
    if (mode === 'missing' && gaps.missing <= 0) return;
    if (mode === 'notAdmin' && gaps.notAdmin <= 0) return;
    setLinksMode(mode);
    setLinksOpen(true);
  }

  function handleQuickAction(mode: Exclude<AccountMetricGroupsMode, 'account'>) {
    if (operateLocked) return;
    if (row.sessionStatus !== 'valid') {
      setSetupFeedback(t('groupMonitoring.accountCard.metricQuickNeedValidSession'));
      return;
    }
    const worker =
      row.platform === 'telegram' ? readTelegramWorkerSettings() : readWhatsAppWorkerSettings();
    if (mode === 'junk' && !worker.leaveDelete.leaveEnabled) {
      setSetupFeedback(t('groupMonitoring.accountCard.metricQuickLeaveDisabled'));
      return;
    }
    if (mode === 'notAdmin' && setAdminOwnerCandidates.length === 0) {
      setSetupFeedback(t('groupMonitoring.accountCard.metricQuickNeedSuperAdmin'));
      return;
    }
    setLinksOpen(false);
    setPendingSetupTask(
      mode === 'missing' ? 'join' : mode === 'notAdmin' ? 'set_admin' : 'exit_delete_group',
    );
  }

  return (
    <>
      <tr
        className={cn(
          'brand-account-row',
          showRemoveHover && 'brand-account-row--removable',
          showClearSessionHover && 'brand-account-row--clearable-session',
        )}
      >
        <td className="brand-col-cell brand-col-cell--account">
          <div className="brand-account-cell">
            <PlatformBadge platform={row.platform} />
            <div className="brand-account-cell-text">
              <p className="truncate text-xs font-medium text-text-primary">{row.accountName}</p>
              <p className="truncate text-[11px] text-text-muted">
                {row.phoneNumber ? (
                  row.phoneNumber
                ) : (
                  <span className="text-danger">{t('groupMonitoring.accountCard.phoneMissing')}</span>
                )}
              </p>
            </div>
            {!isFlatLayout ? (
              <div className="brand-account-cell-tools">
                {showRemoveHover ? (
                  <>
                    <AccountEditSlotIcon
                      onEdit={onEditAccount}
                      structureLocked={structureLocked}
                    />
                    <AccountRemoveSlotIcon
                      onRemove={onRemoveFromSlot}
                      structureLocked={structureLocked}
                    />
                  </>
                ) : null}
                <AccountSyncIcon
                  onSync={onSync}
                  loading={syncLoading}
                  operateLocked={operateLocked}
                />
              </div>
            ) : null}
          </div>
        </td>
        {isFlatLayout ? (
          <td className="brand-col-cell brand-col-cell--brand-name">
            <div className="brand-col-cell-inner">
              <span className="truncate text-text-secondary">{row.brandName}</span>
            </div>
          </td>
        ) : null}
        <td className="brand-col-cell brand-col-cell--role">
          <div className="brand-col-cell-inner">
            <AccountOpsRoleCell role={row.opsRole} />
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--location">
          <div className="brand-col-cell-inner">
            <span className="truncate text-text-secondary">
              {row.locationDevice?.trim() ? row.locationDevice : '—'}
            </span>
          </div>
        </td>
        <td
          className={cn(
            'brand-col-cell brand-col-cell--session',
            showClearSessionHover && 'brand-col-cell--session-clearable',
          )}
        >
          <div className="brand-col-cell-inner">
            <SessionColumnCell
              row={row}
              isPending={isPending}
              onClearSession={onClearSession}
              clearSessionLoading={clearSessionLoading}
              operateLocked={operateLocked}
              hideClearButton={isFlatLayout}
            />
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--on-device">
          <div className="brand-col-cell-inner">
            {isPending ? (
              <span className="brand-account-slot-muted text-xs tabular-nums">—</span>
            ) : row.groupsCurrent > 0 ? (
              <button
                type="button"
                className="brand-metric-hit"
                title={t('groupMonitoring.accountCard.colOnDeviceHint')}
                onClick={() => openMetricModal('account')}
              >
                <span className="brand-gap-metric brand-gap-metric--link text-xs tabular-nums">
                  {row.groupsCurrent}
                </span>
              </button>
            ) : (
              <span className="brand-gap-metric brand-gap-metric--none text-xs tabular-nums">-</span>
            )}
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--junk">
          <div className="brand-col-cell-inner">
            {isPending ? (
              <span className="brand-account-slot-muted text-xs tabular-nums">—</span>
            ) : (
              <MetricGapButton
                gap={gaps.junk}
                title={t('groupMonitoring.accountCard.colJunkHint')}
                onClick={() => openMetricModal('junk')}
              />
            )}
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--in-brand">
          <div className="brand-col-cell-inner">
            {isPending ? (
              <span className="brand-account-slot-muted text-xs tabular-nums">—</span>
            ) : (
              <MetricGapButton
                gap={gaps.missing}
                title={t('groupMonitoring.accountCard.colMissingHint')}
                onClick={() => openMetricModal('missing')}
              />
            )}
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--admin">
          <div className="brand-col-cell-inner">
            {isPending ? (
              <span className="brand-account-slot-muted text-xs tabular-nums">—</span>
            ) : (
              <MetricGapButton
                gap={gaps.notAdmin}
                title={t('groupMonitoring.accountCard.colNotAdminHint')}
                onClick={() => openMetricModal('notAdmin')}
              />
            )}
          </div>
        </td>
        {!isFlatLayout ? (
          <td className="brand-col-cell brand-col-cell--last-update">
            <div className="brand-col-cell-inner">
              <LastUpdateColumnCell
                row={row}
                scraperLoading={scraperLoading}
                scrapeProgress={scrapeProgress}
              />
            </div>
          </td>
        ) : null}
        {showAction ? (
          <td className="brand-col-cell brand-col-cell--action">
            <div className="brand-col-cell-inner">
              <ActionColumnCell
                row={row}
                isPending={isPending}
                operateLocked={operateLocked}
                activeProcessIntent={activeProcessIntent}
                onCancelScrape={onCancelScrape}
              />
            </div>
          </td>
        ) : null}
      </tr>

      {setupFeedback ? (
        <tr className="brand-account-row brand-account-row--feedback">
          <td colSpan={10} className="brand-col-cell">
            <p className="brand-metric-feedback text-xs text-amber-300" role="status">
              {setupFeedback}{' '}
              <button
                type="button"
                className="brand-metric-feedback-dismiss"
                onClick={() => setSetupFeedback(null)}
              >
                {t('groupMonitoring.accountCard.closeModal')}
              </button>
            </p>
          </td>
        </tr>
      ) : null}

      <GroupLinksModal
        open={linksOpen}
        brandName={row.brandName}
        accountName={row.accountName}
        platform={row.platform}
        accountId={row.id}
        initialViewMode={linksMode}
        onClose={() => setLinksOpen(false)}
        onExited={() => {
          if (!pendingSetupTask) return;
          const next = pendingSetupTask;
          setPendingSetupTask(null);
          setSetupTask(next);
          setSetupOpen(true);
        }}
        onQuickAction={handleQuickAction}
        quickActionDisabled={operateLocked}
      />

      {setupTask ? (
        <JobQueueSetupHost
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          onExited={() => {
            setSetupTask(null);
            setSetupOpen(false);
          }}
          onSaved={(message) => {
            setSetupFeedback(message);
            setSetupOpen(false);
          }}
          onFeedback={setSetupFeedback}
          taskType={setupTask}
          platform={row.platform}
          activeBrand={row.brandName}
          selectedAccounts={setupTask === 'set_admin' ? [] : [row]}
          superAdminAccount={undefined}
          targetAccountCandidates={setupTask === 'set_admin' ? validPeers : []}
          validAccounts={validPeers}
          ownerAccountCandidates={setupTask === 'set_admin' ? setAdminOwnerCandidates : undefined}
          preferredSetAdminTargetId={setupTask === 'set_admin' ? row.id : undefined}
          preferredExitGroupTab={setupTask === 'exit_delete_group' ? 'junk' : undefined}
          preferredMasterListExpanded={setupTask === 'join'}
        />
      ) : null}
    </>
  );
}

export function AccountEmptySlotRow({
  slot,
  onAdd,
  structureLocked = false,
}: {
  slot: AccountBrandEmptySlot;
  onAdd?: () => void;
  structureLocked?: boolean;
}) {
  const { t } = useLanguage();

  return (
    <tr className="brand-account-slot-row">
      <td className="brand-col-cell brand-col-cell--account">
        <div className="brand-account-cell">
          <span className="brand-account-slot-icon" aria-hidden />
          <div className="brand-account-cell-text">
            <p className="brand-account-slot-text">{t('groupMonitoring.accountCard.emptySlotAccount')}</p>
            <p className="brand-account-slot-subtext">{t('groupMonitoring.accountCard.emptySlotHint')}</p>
          </div>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--role">
        <div className="brand-col-cell-inner">
          <span className="brand-account-slot-muted text-xs">—</span>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--location">
        <div className="brand-col-cell-inner">
          <span className="brand-account-slot-muted truncate">{slot.brandName}</span>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--session">
        <div className="brand-col-cell-inner">
          <span className="brand-account-slot-muted text-xs">—</span>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--on-device">
        <div className="brand-col-cell-inner">
          <span className="brand-account-slot-muted text-xs tabular-nums">—</span>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--junk">
        <div className="brand-col-cell-inner">
          <span className="brand-account-slot-muted text-xs tabular-nums">—</span>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--in-brand">
        <div className="brand-col-cell-inner">
          <span className="brand-account-slot-muted text-xs tabular-nums">—</span>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--admin">
        <div className="brand-col-cell-inner">
          <span className="brand-account-slot-muted text-xs tabular-nums">—</span>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--last-update">
        <div className="brand-col-cell-inner">
          <span className="brand-account-slot-muted text-xs">—</span>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--action">
        <div className="brand-col-cell-inner">
          {structureLocked ? (
            <PermissionLockedButton
              variant="text"
              className="brand-card-action-btn brand-card-action-btn--slot brand-card-action-btn--nowrap"
            >
              {t('groupMonitoring.accountCard.addAccountSlot')}
            </PermissionLockedButton>
          ) : (
            <button
              type="button"
              className="brand-card-action-btn brand-card-action-btn--slot brand-card-action-btn--nowrap"
              onClick={onAdd}
            >
              {t('groupMonitoring.accountCard.addAccountSlot')}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
