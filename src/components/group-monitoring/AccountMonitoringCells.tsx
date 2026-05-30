import { RefreshCw } from 'lucide-react';
import { BrandImage } from '@/components/brand/BrandImage';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
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

export function AdminProgress({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const tone = pct >= 100 ? 'bg-wa' : pct >= 66 ? 'bg-amber-400' : 'bg-danger';

  return (
    <div className="brand-admin-progress">
      <div className="brand-admin-progress-bar">
        <div className={cn('brand-admin-progress-fill', tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="brand-admin-progress-label">
        {current}/{total} Admin
      </span>
    </div>
  );
}

function AccountSyncIcon({ onSync }: { onSync?: () => void }) {
  const { t } = useLanguage();

  return (
    <button
      type="button"
      className="brand-account-sync-btn"
      title={t('groupMonitoring.accountCard.syncAccountTooltip')}
      aria-label={t('groupMonitoring.accountCard.syncAccountTooltip')}
      onClick={onSync}
    >
      <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}

export function AccountTableRow({
  row,
  showAction = true,
  onSync,
}: {
  row: AccountBrandRow;
  showAction?: boolean;
  onSync?: () => void;
}) {
  const { t } = useLanguage();
  const isPending = row.syncState === 'pending';
  const groupShort = !isPending && row.groupsCurrent < row.groupsTotal;

  return (
    <tr>
      <td className="brand-col-cell brand-col-cell--account">
        <div className="brand-account-cell">
          <PlatformBadge platform={row.platform} />
          <div className="brand-account-cell-text">
            <p className="truncate text-xs font-medium text-text-primary">{row.accountName}</p>
            <p className="truncate text-[11px] text-text-muted">
              {row.phoneOrUsername || '—'}
            </p>
          </div>
          {isPending ? <AccountSyncIcon onSync={onSync} /> : null}
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--brand">
        <span className="truncate text-text-secondary">{row.brandName}</span>
      </td>
      <td className="brand-col-cell brand-col-cell--status">
        {isPending ? (
          <span className="brand-account-slot-pill">—</span>
        ) : (
          <StatusBadge status={row.status} />
        )}
      </td>
      <td className="brand-col-cell brand-col-cell--groups">
        {isPending ? (
          <span className="brand-account-slot-muted text-xs tabular-nums">—</span>
        ) : (
          <>
            <span className="text-xs tabular-nums text-text-primary">
              {row.groupsCurrent}/{row.groupsTotal} {t('groupMonitoring.accountCard.groupsUnit')}
            </span>
            {groupShort ? (
              <span className="ml-1 text-[11px] text-danger">
                (
                {t('groupMonitoring.accountCard.groupsShort', {
                  count: row.groupsTotal - row.groupsCurrent,
                })}
                )
              </span>
            ) : null}
          </>
        )}
      </td>
      <td className="brand-col-cell brand-col-cell--admin">
        {isPending ? (
          <span className="brand-account-slot-muted text-xs">—</span>
        ) : (
          <AdminProgress current={row.adminCurrent} total={row.adminTotal} />
        )}
      </td>
      {showAction ? (
        <td className="brand-col-cell brand-col-cell--action">
          <button
            type="button"
            className="brand-card-action-btn"
            disabled={isPending}
          >
            {t('groupMonitoring.accountCard.groupLink')}
          </button>
        </td>
      ) : null}
    </tr>
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
        <span className="brand-account-slot-muted truncate">{slot.brandName}</span>
      </td>
      <td className="brand-col-cell brand-col-cell--status">
        <span className="brand-account-slot-pill">—</span>
      </td>
      <td className="brand-col-cell brand-col-cell--groups">
        <span className="brand-account-slot-muted text-xs tabular-nums">—/—</span>
      </td>
      <td className="brand-col-cell brand-col-cell--admin">
        <div className="brand-admin-progress">
          <div className="brand-admin-progress-bar brand-admin-progress-bar--empty" />
          <span className="brand-admin-progress-label brand-account-slot-muted">—/— Admin</span>
        </div>
      </td>
      <td className="brand-col-cell brand-col-cell--action">
        <button type="button" className="brand-card-action-btn brand-card-action-btn--slot" onClick={onAdd}>
          {t('groupMonitoring.accountCard.addAccountSlot')}
        </button>
      </td>
    </tr>
  );
}
