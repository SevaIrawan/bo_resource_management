import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BrandImage } from '@/components/brand/BrandImage';
import { GroupLinksModal } from '@/components/group-monitoring/GroupLinksModal';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { formatLastSyncAt } from '@/lib/formatLastSync';
import type { AccountBrandEmptySlot, AccountBrandRow } from '@/types/accountMonitoringUi';

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

export function AdminProgress({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const tone = pct >= 100 ? 'bg-wa' : pct >= 66 ? 'bg-amber-400' : 'bg-danger';

  return (
    <div className="brand-admin-progress">
      <div className="brand-admin-progress-bar">
        <div className={cn('brand-admin-progress-fill', tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="brand-admin-progress-label">
        {current}/{total}
      </span>
    </div>
  );
}

function useScraperProgress(active: boolean): number {
  const [pct, setPct] = useState(0);
  const [visible, setVisible] = useState(active);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setPct(8);
      const timer = window.setInterval(() => {
        setPct((prev) => {
          if (prev >= 92) return prev;
          return Math.min(prev + 6 + Math.floor(Math.random() * 10), 92);
        });
      }, 350);
      return () => window.clearInterval(timer);
    }

    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      setPct(0);
    }, 400);
    return () => window.clearTimeout(hideTimer);
  }, [active]);

  return visible ? pct : 0;
}

function ScraperColumnCell({
  row,
  scraperLoading,
  onRunScraper,
}: {
  row: AccountBrandRow;
  scraperLoading: boolean;
  onRunScraper?: () => void;
}) {
  const { t, locale } = useLanguage();
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-GB';
  const isRunning = scraperLoading || row.actionProcess === 'scraper';
  const progress = useScraperProgress(isRunning);
  const showLastUpdate =
    !isRunning &&
    row.syncState === 'synced' &&
    Boolean(row.lastSyncAt) &&
    (row.sessionStatus === 'invalid' || !row.isMisaligned);

  if (row.sessionStatus === 'invalid') {
    return (
      <span className="brand-account-slot-muted text-xs">
        {t('groupMonitoring.accountCard.useSyncToLogin')}
      </span>
    );
  }

  if (isRunning) {
    return (
      <div className="brand-scraper-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="brand-scraper-progress-bar">
          <div
            className="brand-scraper-progress-fill"
            style={{ width: `${Math.max(progress, 6)}%` }}
          />
        </div>
        <span className="brand-scraper-progress-pct">{progress}%</span>
      </div>
    );
  }

  if (row.syncState === 'synced' && row.isMisaligned && onRunScraper) {
    return (
      <div className="brand-scraper-cell-stack">
        <button
          type="button"
          className="brand-card-action-btn brand-card-action-btn--scraper brand-card-action-btn--nowrap"
          disabled={scraperLoading}
          onClick={onRunScraper}
        >
          {t('groupMonitoring.accountCard.runScraper')}
        </button>
        {showLastUpdate ? (
          <time className="brand-scraper-last-update-time" dateTime={row.lastSyncAt ?? undefined}>
            {formatLastSyncAt(row.lastSyncAt, dateLocale)}
          </time>
        ) : null}
      </div>
    );
  }

  if (row.syncState === 'synced' && showLastUpdate) {
    return (
      <time className="brand-scraper-last-update-time" dateTime={row.lastSyncAt ?? undefined}>
        {formatLastSyncAt(row.lastSyncAt, dateLocale)}
      </time>
    );
  }

  return <span className="brand-account-slot-muted text-xs">—</span>;
}

function AccountSyncIcon({
  onSync,
  loading = false,
}: {
  onSync?: () => void;
  loading?: boolean;
}) {
  const { t } = useLanguage();

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

function ProcessActionLabel({ action }: { action: 'sync' | 'scraper' }) {
  const { t } = useLanguage();
  const label =
    action === 'sync'
      ? t('groupMonitoring.accountCard.procSync')
      : t('groupMonitoring.accountCard.procScraper');

  return <span className="brand-action-process">{label}</span>;
}

export function AccountTableRow({
  row,
  showAction = true,
  onSync,
  onRunScraper,
  syncLoading = false,
  scraperLoading = false,
}: {
  row: AccountBrandRow;
  showAction?: boolean;
  onSync?: () => void;
  onRunScraper?: () => void;
  syncLoading?: boolean;
  scraperLoading?: boolean;
}) {
  const { t } = useLanguage();
  const [linksOpen, setLinksOpen] = useState(false);
  const isPending = row.syncState === 'pending';
  const isProcessing = row.actionProcess !== null;

  return (
    <>
      <tr>
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
            <AccountSyncIcon onSync={onSync} loading={syncLoading} />
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--brand">
          <div className="brand-col-cell-inner">
            <span className="truncate text-text-secondary">{row.brandName}</span>
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
        <td className="brand-col-cell brand-col-cell--session">
          <div className="brand-col-cell-inner">
            <SessionBadge status={row.sessionStatus} />
          </div>
        </td>
        <td className="brand-col-cell brand-col-cell--groups">
          <div className="brand-col-cell-inner">
            {isPending ? (
              <span className="brand-account-slot-muted text-xs tabular-nums">—/—</span>
            ) : (
              <span className="text-xs tabular-nums text-text-primary">
                {row.groupsCurrent}/{row.groupsTotal}
              </span>
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
              onRunScraper={onRunScraper}
            />
          </div>
        </td>
        {showAction ? (
          <td className="brand-col-cell brand-col-cell--action">
            <div className="brand-col-cell-inner">
              {isProcessing ? (
                <ProcessActionLabel action={row.actionProcess!} />
              ) : (
                <button
                  type="button"
                  className="brand-card-action-btn brand-card-action-btn--nowrap"
                  disabled={isPending}
                  onClick={() => setLinksOpen(true)}
                >
                  {t('groupMonitoring.accountCard.groupLink')}
                </button>
              )}
            </div>
          </td>
        ) : null}
      </tr>

      <GroupLinksModal
        open={linksOpen}
        brandName={row.brandName}
        accountName={row.accountName}
        platform={row.platform}
        accountId={row.id}
        onClose={() => setLinksOpen(false)}
      />
    </>
  );
}

export function AccountEmptySlotRow({
  slot,
  onAdd,
}: {
  slot: AccountBrandEmptySlot;
  onAdd: () => void;
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
      <td className="brand-col-cell brand-col-cell--groups">
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
          <button
            type="button"
            className="brand-card-action-btn brand-card-action-btn--slot brand-card-action-btn--nowrap"
            onClick={onAdd}
          >
            {t('groupMonitoring.accountCard.addAccountSlot')}
          </button>
        </div>
      </td>
    </tr>
  );
}
