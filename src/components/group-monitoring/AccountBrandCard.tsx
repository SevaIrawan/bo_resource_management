import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BrandImage } from '@/components/brand/BrandImage';
import {
  countAccountsByPlatform,
  masterGroupCountsByPlatform,
  type AccountPlatformFilter,
} from '@/lib/brandCardHeaderBadges';
import { resolveMessagingAccountSaveErrorCode } from '@/lib/messagingAccounts';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { AddAccountHeaderMenu } from '@/components/group-monitoring/AddAccountHeaderMenu';
import { BrandMasterGroupsModal } from '@/components/group-monitoring/BrandMasterGroupsModal';
import { CardDismissButton } from '@/components/group-monitoring/CardDismissButton';
import { AccountBrandStockChips } from '@/components/group-monitoring/AccountBrandStockChips';
import { OperationsBrandHeaderMeta } from '@/components/group-monitoring/OperationsBrandHeaderMeta';
import { OperationsStockDetailModal } from '@/components/group-monitoring/OperationsStockDetailModal';
import {
  AddAccountModal,
  type AddAccountFormValues,
} from '@/components/group-monitoring/AddAccountModal';
import {
  EditAccountModal,
  type EditAccountFormValues,
} from '@/components/group-monitoring/EditAccountModal';
import { AccountEmptySlotRow, AccountTableRow } from '@/components/group-monitoring/AccountMonitoringCells';
import {
  AccountMonitoringTableColGroup,
  AccountMonitoringTableHead,
} from '@/components/group-monitoring/AccountMonitoringTableParts';
import type { AddAccountInput, AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';
import type { RowProcessingSpinner } from '@/hooks/useAccountSyncFlow';
import type { UiScrapeProgress } from '@/types/scrapeProgress';
import {
  EMPTY_GROUP_STOCK_COUNTS,
  EMPTY_GROUP_STOCK_HEADER_META,
  type GroupStockBucket,
  type GroupStockCounts,
  type GroupStockHeaderMeta,
} from '@/types/groupStock';

interface AccountBrandCardProps {
  group: AccountBrandGroup;
  activePlatformFilter?: AccountPlatformFilter;
  /** Jumlah grup master live (groups_master) — sumber badge Group + To prep. */
  masterGroupCount?: number;
  stockCounts?: GroupStockCounts;
  stockHeaderMeta?: GroupStockHeaderMeta;
  canManageStructure?: boolean;
  canOperatePlatform?: boolean;
  onAddAccount: (input: AddAccountInput) => Promise<void>;
  onEditAccount?: (account: AccountBrandRow, values: EditAccountFormValues) => Promise<void>;
  onSyncAccount?: (accountId: string) => void;
  onClearSession?: (accountId: string) => void;
  onRemoveFromSlot?: (account: import('@/types/accountMonitoringUi').AccountBrandRow) => void;
  onCancelScrape?: (accountId: string) => void;
  processingByAccount?: Record<string, RowProcessingSpinner>;
  clearingSessionAccountId?: string | null;
  getScrapeProgress?: (accountId: string) => UiScrapeProgress | null;
  defaultExpanded?: boolean;
  onDismiss?: () => void;
}

function resolveHeaderPlatform(filter: AccountPlatformFilter): Platform {
  return filter === 'telegram' ? 'telegram' : 'whatsapp';
}

export function AccountBrandCard({
  group,
  activePlatformFilter = 'whatsapp',
  masterGroupCount,
  stockCounts = EMPTY_GROUP_STOCK_COUNTS,
  stockHeaderMeta = EMPTY_GROUP_STOCK_HEADER_META,
  canManageStructure = true,
  canOperatePlatform = true,
  onAddAccount,
  onEditAccount,
  onSyncAccount,
  onClearSession,
  onRemoveFromSlot,
  onCancelScrape,
  processingByAccount = {},
  clearingSessionAccountId = null,
  getScrapeProgress,
  defaultExpanded = true,
  onDismiss,
}: AccountBrandCardProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [addPlatform, setAddPlatform] = useState<Platform | null>(null);
  const [addSlotId, setAddSlotId] = useState<string | undefined>();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountBrandRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [comparePlatform, setComparePlatform] = useState<Platform | null>(null);
  const [stockDetailBucket, setStockDetailBucket] = useState<GroupStockBucket | null>(null);

  const headerPlatform = resolveHeaderPlatform(activePlatformFilter);
  const accountsByPlatform = useMemo(
    () => countAccountsByPlatform(group.accounts),
    [group.accounts],
  );
  const groupsByPlatform = useMemo(
    () => masterGroupCountsByPlatform(group.standardGroupCountByPlatform),
    [group.standardGroupCountByPlatform],
  );
  const accountCount =
    headerPlatform === 'whatsapp' ? accountsByPlatform.whatsapp : accountsByPlatform.telegram;
  const gridGroupCount =
    headerPlatform === 'whatsapp' ? groupsByPlatform.whatsapp : groupsByPlatform.telegram;
  /** Badge Group = master live (sama sumber chip + To prep); fallback grid sebelum load. */
  const groupCount =
    masterGroupCount != null && Number.isFinite(masterGroupCount)
      ? Math.max(0, Math.floor(masterGroupCount))
      : gridGroupCount;
  const platformAccounts = useMemo(
    () => group.accounts.filter((row) => row.platform === headerPlatform),
    [group.accounts, headerPlatform],
  );
  const logoutCount = useMemo(
    () => platformAccounts.filter((row) => row.sessionStatus === 'invalid').length,
    [platformAccounts],
  );
  const notAlignedCount = useMemo(
    () => platformAccounts.filter((row) => row.isMisaligned).length,
    [platformAccounts],
  );
  const platformShort = headerPlatform === 'whatsapp' ? 'WA' : 'TG';
  const platformAsset = headerPlatform === 'whatsapp' ? 'whatsapp' : 'telegram';

  function openAddFlow(platform: Platform, slotId?: string) {
    if (!canManageStructure) return;
    setAddSlotId(slotId);
    setAddPlatform(platform);
    setSaveError(null);
    setAddModalOpen(true);
  }

  function openAddFromSlot(slotId: string) {
    if (!canManageStructure) return;
    setAddSlotId(slotId);
    setAddPlatform(null);
    setSaveError(null);
    setAddModalOpen(true);
  }

  function closeAddFlow() {
    if (saving) return;
    setAddModalOpen(false);
    setAddPlatform(null);
    setAddSlotId(undefined);
    setSaveError(null);
  }

  async function handleSaveAccount(
    values: AddAccountFormValues,
    platform: Platform,
  ) {
    setSaving(true);
    setSaveError(null);

    try {
      await onAddAccount({
        platform,
        accountName: values.accountName,
        phoneNumber: values.phoneNumber,
        locationDevice: values.locationDevice,
        opsRole: values.opsRole,
        slotId: addSlotId,
      });
      setAddModalOpen(false);
      setAddPlatform(null);
      setAddSlotId(undefined);
      setSaveError(null);
    } catch (error) {
      const code = resolveMessagingAccountSaveErrorCode(error);
      setSaveError(
        code === 'SUPABASE_NOT_CONFIGURED'
          ? t('login.supabaseNotConfigured')
          : code === 'ACCOUNT_LABEL_IN_USE'
            ? t('groupMonitoring.accountCard.accountLabelInUse')
            : t('groupMonitoring.accountCard.saveAccountFailed'),
      );
    } finally {
      setSaving(false);
    }
  }

  function closeEditFlow() {
    if (editSaving) return;
    setEditTarget(null);
    setEditError(null);
  }

  async function handleSaveEdit(values: EditAccountFormValues) {
    if (!editTarget || !onEditAccount) return;

    setEditSaving(true);
    setEditError(null);

    try {
      await onEditAccount(editTarget, values);
      setEditTarget(null);
      setEditError(null);
    } catch (error) {
      if (error instanceof Error && error.message === 'OPS_ROLE_REQUIRED') {
        setEditError(t('groupMonitoring.accountCard.opsRoleRequired'));
        return;
      }
      const code = resolveMessagingAccountSaveErrorCode(error);
      setEditError(
        code === 'SUPABASE_NOT_CONFIGURED'
          ? t('login.supabaseNotConfigured')
          : code === 'ACCOUNT_LABEL_IN_USE'
            ? t('groupMonitoring.accountCard.accountLabelInUse')
            : t('groupMonitoring.accountCard.saveAccountFailed'),
      );
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <>
      <article className="brand-card">
        <div className="brand-card-header">
          <button
            type="button"
            className="brand-card-header-toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            <ChevronDown
              className={cn('brand-card-chevron', !expanded && 'brand-card-chevron--collapsed')}
              aria-hidden
            />
            <span className="brand-card-title">
              Brand : {group.brandName}
            </span>
            <OperationsBrandHeaderMeta meta={stockHeaderMeta} />
          </button>

          <div className="brand-card-header-actions">
            <span
              className="brand-card-badge brand-card-badge--neutral brand-card-badge--split brand-card-badge--platform-summary"
              aria-label={t('groupMonitoring.accountCard.platformSummaryAria', {
                platform: platformShort,
                accounts: accountCount,
                groups: groupCount,
                logout: logoutCount,
                notAligned: notAlignedCount,
              })}
            >
              <BrandImage
                asset={platformAsset}
                alt=""
                className="brand-card-badge-platform-icon inline h-3 w-3 shrink-0"
                aria-hidden
              />
              <span className="brand-card-badge-caption">
                <span className="brand-card-badge-caption-label">{platformShort}</span>
                <button
                  type="button"
                  className="brand-card-badge-group-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    setComparePlatform(headerPlatform);
                  }}
                  aria-label={
                    headerPlatform === 'whatsapp'
                      ? t('groupMonitoring.accountCard.platformGroupsBadgeWa', {
                          count: groupCount,
                        })
                      : t('groupMonitoring.accountCard.platformGroupsBadgeTg', {
                          count: groupCount,
                        })
                  }
                >
                  <span className="brand-card-badge-count brand-card-badge-count--group">
                    {groupCount}
                  </span>
                  <span className="brand-card-badge-caption-label">
                    {t('groupMonitoring.accountCard.platformSummaryGroupSuffix')}
                  </span>
                </button>
                <span className="brand-card-badge-divider" aria-hidden>
                  |
                </span>
                <span className="brand-card-badge-count brand-card-badge-count--acc">
                  {accountCount}
                </span>
                <span className="brand-card-badge-caption-label">
                  {t('groupMonitoring.accountCard.platformSummaryAccSuffix')}
                </span>
                <span className="brand-card-badge-divider" aria-hidden>
                  |
                </span>
                <span className="brand-card-badge-count brand-card-badge-count--alert">
                  {logoutCount}
                </span>
                <span className="brand-card-badge-caption-label">
                  {t('groupMonitoring.accountCard.platformSummaryLogoutSuffix')}
                </span>
                <span className="brand-card-badge-divider" aria-hidden>
                  |
                </span>
                <span className="brand-card-badge-count brand-card-badge-count--alert">
                  {notAlignedCount}
                </span>
                <span className="brand-card-badge-caption-label">
                  {t('groupMonitoring.accountCard.platformSummaryNotAlignedSuffix')}
                </span>
              </span>
            </span>

            <AccountBrandStockChips
              className="brand-card-header-stock"
              counts={stockCounts}
              onBucketClick={setStockDetailBucket}
            />

            <AddAccountHeaderMenu
              locked={!canManageStructure}
              onSelectPlatform={(platform) => openAddFlow(platform)}
            />
          </div>

          <CardDismissButton
            locked={!canManageStructure}
            onDismiss={onDismiss}
            className="card-header-dismiss-btn brand-card-header-dismiss"
          />
        </div>

        {expanded ? (
          <div className="brand-card-body">
              <table className="brand-card-table">
                <AccountMonitoringTableColGroup />
                <AccountMonitoringTableHead />
                <tbody>
                  {group.accounts.map((row) => (
                    <AccountTableRow
                      key={row.id}
                      row={row}
                      brandAccounts={group.accounts}
                      canOperatePlatform={canOperatePlatform}
                      canManageStructure={canManageStructure}
                      syncLoading={processingByAccount[row.id] === 'sync'}
                      scraperLoading={processingByAccount[row.id] === 'scraper'}
                      scrapeProgress={getScrapeProgress?.(row.id) ?? null}
                      onSync={() => onSyncAccount?.(row.id)}
                      onCancelScrape={() => onCancelScrape?.(row.id)}
                      onRemoveFromSlot={
                        onRemoveFromSlot ? () => onRemoveFromSlot(row) : undefined
                      }
                      onEditAccount={
                        onEditAccount ? () => setEditTarget(row) : undefined
                      }
                      onClearSession={
                        onClearSession ? () => onClearSession(row.id) : undefined
                      }
                      clearSessionLoading={clearingSessionAccountId === row.id}
                    />
                  ))}
                  {group.emptySlots.map((slot) => (
                    <AccountEmptySlotRow
                      key={slot.id}
                      slot={slot}
                      structureLocked={!canManageStructure}
                      onAdd={() => openAddFromSlot(slot.id)}
                    />
                  ))}
                </tbody>
              </table>
          </div>
        ) : null}
      </article>

      <AddAccountModal
        open={addModalOpen}
        platform={addPlatform}
        brandName={group.brandName}
        saving={saving}
        error={saveError}
        onClose={closeAddFlow}
        onSubmit={handleSaveAccount}
      />

      <EditAccountModal
        open={editTarget != null}
        account={editTarget}
        brandName={group.brandName}
        saving={editSaving}
        error={editError}
        onClose={closeEditFlow}
        onSubmit={(values) => void handleSaveEdit(values)}
      />

      {comparePlatform ? (
        <BrandMasterGroupsModal
          open
          brandName={group.brandName}
          platform={comparePlatform}
          accounts={group.accounts}
          onClose={() => setComparePlatform(null)}
        />
      ) : null}

      {stockDetailBucket ? (
        <OperationsStockDetailModal
          open
          brandName={group.brandName}
          platform={headerPlatform}
          bucket={stockDetailBucket}
          onClose={() => setStockDetailBucket(null)}
        />
      ) : null}
    </>
  );
}
