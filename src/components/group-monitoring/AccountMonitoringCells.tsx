import { useState } from 'react';
import { RefreshCw, Pencil, X } from 'lucide-react';
import { PermissionLockedButton } from '@/components/ui/PermissionLockedButton';
import { BrandImage } from '@/components/brand/BrandImage';
import { GroupLinksModal } from '@/components/group-monitoring/GroupLinksModal';
import {
  GroupLinksPickerModal,
  type GroupLinksViewMode,
} from '@/components/group-monitoring/GroupLinksPickerModal';
import { accountNeedsRelogin } from '@/lib/platformSyncCopy';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { formatLastSyncAt } from '@/lib/formatLastSync';
import type { AccountBrandEmptySlot, AccountBrandRow } from '@/types/accountMonitoringUi';
import { ScraperStatusMarquee } from '@/components/group-monitoring/ScraperStatusMarquee';
import { resolveScrapeBarDisplay } from '@/lib/scrapeProgressDisplay';
import { resolveAccountActionColumn } from '@/lib/accountActionColumn';
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

export function StatusBadge({ status }: { status: AccountBrandRow['status'] }) {
  const { t } = useLanguage();
  const isActive = status === 'active';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
        isActive ? 'bg-wa/10 text-wa' : 'bg-danger/10 text-danger',
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', isActive ? 'bg-wa' : 'bg-danger')}
      />
      {isActive
        ? t('groupMonitoring.accountCard.statusActive')
        : t('groupMonitoring.accountCard.statusLogout')}
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
}: {
  row: AccountBrandRow;
  isPending: boolean;
  onClearSession?: () => void;
  clearSessionLoading?: boolean;
  operateLocked?: boolean;
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
  onOpenGroupLinks,
}: {
  row: AccountBrandRow;
  isPending: boolean;
  operateLocked: boolean;
  activeProcessIntent?: 'sync' | 'scraper' | null;
  onCancelScrape?: () => void;
  onOpenGroupLinks: () => void;
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

  if (kind === 'proc-scraper') {
    return (
      <span className="brand-action-process" aria-live="polite">
        {t('groupMonitoring.accountCard.procScraper')}
      </span>
    );
  }

  if (kind === 'cancel-run') {
    if (operateLocked) {
      return (
        <PermissionLockedButton
          variant="text"
          className="brand-card-action-btn brand-card-action-btn--nowrap brand-card-action-btn--cancel-run"
        >
          {t('groupMonitoring.accountCard.cancelRun')}
        </PermissionLockedButton>
      );
    }

    return (
      <button
        type="button"
        className="brand-card-action-btn brand-card-action-btn--nowrap brand-card-action-btn--cancel-run"
        title={t('groupMonitoring.accountCard.cancelRunHint')}
        onClick={() => onCancelScrape?.()}
      >
        {t('groupMonitoring.accountCard.cancelRun')}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="brand-card-action-btn brand-card-action-btn--nowrap"
      disabled={isPending}
      title={t('groupMonitoring.accountCard.groupLinkHint')}
      onClick={onOpenGroupLinks}
    >
      {t('groupMonitoring.accountCard.groupLink')}
    </button>
  );
}

/** Y/X label: Y kurang dari X → Y merah; Y sama X → seluruh ratio hijau. */
function MetricRatioLabel({ current: y, total: x }: { current: number; total: number }) {
  const aligned = x > 0 && y === x;
  const short = x > 0 && y < x;

  return (
    <span className="brand-metric-ratio text-xs tabular-nums">
      <span className={cn(aligned && 'text-wa', short && 'text-danger', !aligned && !short && 'text-text-primary')}>
        {y}
      </span>
      <span className={cn(aligned ? 'text-wa' : 'text-text-primary')}>/</span>
      <span className={cn(aligned ? 'text-wa' : 'text-text-primary')}>{x}</span>
    </span>
  );
}

export function AdminProgress({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const tone = pct >= 100 ? 'bg-wa' : pct >= 66 ? 'bg-amber-400' : 'bg-danger';

  return (
    <div className="brand-admin-progress">
      <div className="brand-admin-progress-bar">
        <div className={cn('brand-admin-progress-fill', tone)} style={{ width: `${pct}%` }} />
      </div>
      <MetricRatioLabel current={current} total={total} />
    </div>
  );
}

function ScraperColumnCell({
  row,
  scraperLoading,
  scrapeProgress,
  onRunScraper,
  operateLocked = false,
}: {
  row: AccountBrandRow;
  scraperLoading: boolean;
  scrapeProgress?: UiScrapeProgress | null;
  onRunScraper?: () => void;
  operateLocked?: boolean;
}) {
  const { t, locale } = useLanguage();
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-GB';
  const isRunning = scraperLoading || row.actionProcess === 'scraper';
  const canShowLastUpdate =
    !isRunning && row.syncState === 'synced' && Boolean(row.lastSyncAt);

  if (accountNeedsRelogin(row)) {
    return (
      <span className="brand-account-slot-muted text-xs">
        {t('groupMonitoring.accountCard.useSyncToLogin')}
      </span>
    );
  }

  if (isRunning) {
    const fallbackLabel = t('groupMonitoring.accountCard.scraperRunning');
    const bar = resolveScrapeBarDisplay(row, scrapeProgress, fallbackLabel);

    return (
      <div className="brand-scraper-cell-stack">
        <div
          className="brand-scraper-progress"
          role="progressbar"
          aria-valuenow={bar.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-busy="true"
          aria-label={bar.label}
        >
          <div className="brand-scraper-progress-bar">
            <div
              className="brand-scraper-progress-fill"
              style={{ width: `${bar.percent}%` }}
            />
          </div>
          <span className="brand-scraper-progress-pct">
            {bar.current}/{bar.total}
          </span>
        </div>
        <ScraperStatusMarquee label={bar.label} />
      </div>
    );
  }

  const canRunScraper =
    row.sessionStatus === 'valid' &&
    row.syncState !== 'pending' &&
    (onRunScraper || operateLocked);

  if (canRunScraper) {
    return (
      <div className="brand-scraper-cell-stack">
        {operateLocked ? (
          <PermissionLockedButton
            variant="text"
            className="brand-scraper-run-link permission-locked-btn--run"
          >
            {t('groupMonitoring.accountCard.run')}
          </PermissionLockedButton>
        ) : (
          <button
            type="button"
            className="brand-scraper-run-link"
            disabled={scraperLoading}
            onClick={() => onRunScraper?.()}
            aria-label={t('groupMonitoring.accountCard.runScraper')}
          >
            {t('groupMonitoring.accountCard.run')}
          </button>
        )}
        {canShowLastUpdate ? (
          <time className="brand-scraper-last-update-time" dateTime={row.lastSyncAt ?? undefined}>
            {formatLastSyncAt(row.lastSyncAt, dateLocale)}
          </time>
        ) : null}
      </div>
    );
  }

  if (row.syncState === 'synced' && canShowLastUpdate) {
    return (
      <div className="brand-scraper-cell-stack">
        <time className="brand-scraper-last-update-time" dateTime={row.lastSyncAt ?? undefined}>
          {formatLastSyncAt(row.lastSyncAt, dateLocale)}
        </time>
      </div>
    );
  }

  // pending / belum synced: tampilan netral (—)
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

export function AccountTableRow({
  row,
  showAction = true,
  onSync,
  onRunScraper,
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
  showAction?: boolean;
  onSync?: () => void;
  onRunScraper?: () => void;
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [linksViewMode, setLinksViewMode] = useState<GroupLinksViewMode>('adminMaster');
  const isPending = row.syncState === 'pending';
  const isProcessing = row.actionProcess !== null;
  const activeProcessIntent = syncLoading ? 'sync' : scraperLoading ? 'scraper' : null;

  const operateLocked = !canOperatePlatform;
  const structureLocked = !canManageStructure;
  const showRemoveHover =
    (Boolean(onRemoveFromSlot) || Boolean(onEditAccount) || structureLocked) &&
    !isPending &&
    !isProcessing;
  const showClearSessionHover =
    (Boolean(onClearSession) || operateLocked) &&
    !isPending &&
    !isProcessing &&
    row.sessionStatus === 'valid';

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
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--brand">
          <div className="brand-col-cell-inner">
            <span className="truncate text-text-secondary">
              {row.locationDevice?.trim() ? row.locationDevice : '—'}
            </span>
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--status">
          <div className="brand-col-cell-inner">
            {isPending ? (
              <span className="brand-account-slot-pill">—</span>
            ) : (
              <StatusBadge status={row.status} />
            )}
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
            />
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--on-device">
          <div className="brand-col-cell-inner">
            {isPending ? (
              <span className="brand-account-slot-muted text-xs tabular-nums">—</span>
            ) : (
              <span className="text-xs tabular-nums text-text-primary">{row.groupsCurrent}</span>
            )}
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--in-brand">
          <div className="brand-col-cell-inner">
            {isPending ? (
              <span className="brand-account-slot-muted text-xs tabular-nums">—/—</span>
            ) : (
              <MetricRatioLabel current={row.joinedInMaster} total={row.groupsTotal} />
            )}
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--admin">
          <div className="brand-col-cell-inner">
            {isPending ? (
              <span className="brand-account-slot-muted text-xs">—/—</span>
            ) : (
              <AdminProgress current={row.adminCurrent} total={row.adminTotal} />
            )}
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--scraper">
          <div className="brand-col-cell-inner">
            <ScraperColumnCell
              row={row}
              scraperLoading={scraperLoading}
              scrapeProgress={scrapeProgress}
              onRunScraper={onRunScraper}
              operateLocked={operateLocked}
            />
          </div>
        </td>
        {showAction ? (
          <td className="brand-col-cell brand-col-cell--action">
            <div className="brand-col-cell-inner">
              <ActionColumnCell
                row={row}
                isPending={isPending}
                operateLocked={operateLocked}
                activeProcessIntent={activeProcessIntent}
                onCancelScrape={onCancelScrape}
                onOpenGroupLinks={() => setPickerOpen(true)}
              />
            </div>
          </td>
        ) : null}
      </tr>

      <GroupLinksPickerModal
        open={pickerOpen}
        accountName={row.accountName}
        onClose={() => setPickerOpen(false)}
        onSelect={(mode) => {
          setLinksViewMode(mode);
          setPickerOpen(false);
          setLinksOpen(true);
        }}
      />
      <GroupLinksModal
        open={linksOpen}
        brandName={row.brandName}
        accountName={row.accountName}
        platform={row.platform}
        accountId={row.id}
        viewMode={linksViewMode}
        onClose={() => setLinksOpen(false)}
      />
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
      <td className="brand-col-cell brand-col-cell--brand">
        <div className="brand-col-cell-inner">
          <span className="brand-account-slot-muted truncate">{slot.brandName}</span>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--status">
        <div className="brand-col-cell-inner">
          <span className="brand-account-slot-pill">—</span>
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
      <td className="brand-col-cell brand-col-cell--in-brand">
        <div className="brand-col-cell-inner">
          <span className="brand-account-slot-muted text-xs tabular-nums">—/—</span>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--admin">
        <div className="brand-col-cell-inner">
          <div className="brand-admin-progress">
            <div className="brand-admin-progress-bar brand-admin-progress-bar--empty" />
            <span className="brand-admin-progress-label brand-account-slot-muted">—/—</span>
          </div>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--scraper">
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
