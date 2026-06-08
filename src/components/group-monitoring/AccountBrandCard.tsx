import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  countAccountsByPlatform,
  masterGroupCountsByPlatform,
} from '@/lib/brandCardHeaderBadges';
import { resolveMessagingAccountSaveErrorCode } from '@/lib/messagingAccounts';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { AddAccountHeaderMenu } from '@/components/group-monitoring/AddAccountHeaderMenu';
import {
  BrandMasterGroupsModal,
  BrandPlatformGroupsBadgeButton,
} from '@/components/group-monitoring/BrandMasterGroupsModal';
import { CardDismissButton } from '@/components/group-monitoring/CardDismissButton';
import {
  AddAccountModal,
  type AddAccountFormValues,
} from '@/components/group-monitoring/AddAccountModal';
import { AccountEmptySlotRow, AccountTableRow } from '@/components/group-monitoring/AccountMonitoringCells';
import {
  AccountMonitoringTableColGroup,
  AccountMonitoringTableHead,
} from '@/components/group-monitoring/AccountMonitoringTableParts';
import type { AddAccountInput, AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';
import type { UiScrapeProgress } from '@/types/scrapeProgress';

interface AccountBrandCardProps {
  group: AccountBrandGroup;
  canManageStructure?: boolean;
  canOperatePlatform?: boolean;
  onAddAccount: (input: AddAccountInput) => Promise<void>;
  onSyncAccount?: (accountId: string) => void;
  onRemoveFromSlot?: (account: import('@/types/accountMonitoringUi').AccountBrandRow) => void;
  onRunScraper?: (accountId: string) => void;
  onCancelScrape?: (accountId: string) => void;
  checkingAccountId?: string | null;
  scraperAccountId?: string | null;
  getScrapeProgress?: (accountId: string) => UiScrapeProgress | null;
  defaultExpanded?: boolean;
  onDismiss?: () => void;
}

export function AccountBrandCard({
  group,
  canManageStructure = true,
  canOperatePlatform = true,
  onAddAccount,
  onSyncAccount,
  onRemoveFromSlot,
  onRunScraper,
  onCancelScrape,
  checkingAccountId = null,
  scraperAccountId = null,
  getScrapeProgress,
  defaultExpanded = true,
  onDismiss,
}: AccountBrandCardProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [addPlatform, setAddPlatform] = useState<Platform | null>(null);
  const [addSlotId, setAddSlotId] = useState<string | undefined>();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [comparePlatform, setComparePlatform] = useState<Platform | null>(null);

  const allAligned = group.misalignedCount === 0;

  const accountsByPlatform = useMemo(
    () => countAccountsByPlatform(group.accounts),
    [group.accounts],
  );
  const groupsByPlatform = useMemo(
    () => masterGroupCountsByPlatform(group.standardGroupCountByPlatform),
    [group.standardGroupCountByPlatform],
  );

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
          </button>

          <div className="brand-card-header-actions">
            <span className="brand-card-badge brand-card-badge--neutral brand-card-badge--split">
              {t('groupMonitoring.accountCard.platformAccountsBadge', {
                wa: accountsByPlatform.whatsapp,
                tg: accountsByPlatform.telegram,
              })}
            </span>
            <span className="brand-card-header-platform-badges">
              <BrandPlatformGroupsBadgeButton
                platform="whatsapp"
                count={groupsByPlatform.whatsapp}
                onClick={() => setComparePlatform('whatsapp')}
              />
              <BrandPlatformGroupsBadgeButton
                platform="telegram"
                count={groupsByPlatform.telegram}
                onClick={() => setComparePlatform('telegram')}
              />
            </span>
            <span
              className={cn(
                'brand-card-badge',
                allAligned ? 'brand-card-badge--success' : 'brand-card-badge--danger',
              )}
            >
              {allAligned
                ? t('groupMonitoring.accountCard.allAligned')
                : t('groupMonitoring.accountCard.misaligned', { count: group.misalignedCount })}
            </span>
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
                      canOperatePlatform={canOperatePlatform}
                      canManageStructure={canManageStructure}
                      syncLoading={checkingAccountId === row.id}
                      scraperLoading={scraperAccountId === row.id}
                      scrapeProgress={getScrapeProgress?.(row.id) ?? null}
                      onSync={() => onSyncAccount?.(row.id)}
                      onRunScraper={() => onRunScraper?.(row.id)}
                      onCancelScrape={() => onCancelScrape?.(row.id)}
                      onRemoveFromSlot={
                        onRemoveFromSlot ? () => onRemoveFromSlot(row) : undefined
                      }
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

      {comparePlatform ? (
        <BrandMasterGroupsModal
          open
          brandName={group.brandName}
          platform={comparePlatform}
          onClose={() => setComparePlatform(null)}
        />
      ) : null}
    </>
  );
}
