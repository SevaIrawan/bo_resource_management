import { ChevronDown, Download } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { exportBrandAccountsExcel } from '@/lib/exportExcel';
import { AddAccountHeaderMenu } from '@/components/group-monitoring/AddAccountHeaderMenu';
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
  onAddAccount: (input: AddAccountInput) => Promise<void>;
  onSyncAccount?: (accountId: string) => void;
  onRemoveFromSlot?: (account: import('@/types/accountMonitoringUi').AccountBrandRow) => void;
  onRunScraper?: (accountId: string) => void;
  checkingAccountId?: string | null;
  scraperAccountId?: string | null;
  getScrapeProgress?: (accountId: string) => UiScrapeProgress | null;
  defaultExpanded?: boolean;
}

export function AccountBrandCard({
  group,
  onAddAccount,
  onSyncAccount,
  onRemoveFromSlot,
  onRunScraper,
  checkingAccountId = null,
  scraperAccountId = null,
  getScrapeProgress,
  defaultExpanded = true,
}: AccountBrandCardProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [addPlatform, setAddPlatform] = useState<Platform | null>(null);
  const [addSlotId, setAddSlotId] = useState<string | undefined>();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleExportBrand() {
    if (group.accounts.length === 0) return;
    exportBrandAccountsExcel(group);
  }

  const allAligned = group.misalignedCount === 0;

  function openAddFlow(platform: Platform, slotId?: string) {
    setAddSlotId(slotId);
    setAddPlatform(platform);
    setSaveError(null);
    setAddModalOpen(true);
  }

  function openAddFromSlot(slotId: string) {
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
      const code = error instanceof Error ? error.message : 'SAVE_FAILED';
      setSaveError(
        code === 'SUPABASE_NOT_CONFIGURED'
          ? t('login.supabaseNotConfigured')
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
            <span className="brand-card-badge brand-card-badge--neutral">
              {t('groupMonitoring.accountCard.accountCount', { count: group.accountCount })}
            </span>
            {group.standardGroupCountByPlatform?.whatsapp != null &&
            group.standardGroupCountByPlatform.whatsapp > 0 ? (
              <span className="brand-card-badge brand-card-badge--neutral">
                {t('groupMonitoring.accountCard.standardGroupsWa', {
                  count: group.standardGroupCountByPlatform.whatsapp,
                })}
              </span>
            ) : null}
            {group.standardGroupCountByPlatform?.telegram != null &&
            group.standardGroupCountByPlatform.telegram > 0 ? (
              <span className="brand-card-badge brand-card-badge--neutral">
                {t('groupMonitoring.accountCard.standardGroupsTg', {
                  count: group.standardGroupCountByPlatform.telegram,
                })}
              </span>
            ) : null}
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
            <AddAccountHeaderMenu onSelectPlatform={(platform) => openAddFlow(platform)} />
          </div>
        </div>

        {expanded ? (
          <>
            <div className="brand-card-body">
              <table className="brand-card-table">
                <AccountMonitoringTableColGroup />
                <AccountMonitoringTableHead />
                <tbody>
                  {group.accounts.map((row) => (
                    <AccountTableRow
                      key={row.id}
                      row={row}
                      syncLoading={checkingAccountId === row.id}
                      scraperLoading={scraperAccountId === row.id}
                      scrapeProgress={getScrapeProgress?.(row.id) ?? null}
                      onSync={() => onSyncAccount?.(row.id)}
                      onRunScraper={() => onRunScraper?.(row.id)}
                      onRemoveFromSlot={
                        onRemoveFromSlot ? () => onRemoveFromSlot(row) : undefined
                      }
                    />
                  ))}
                  {group.emptySlots.map((slot) => (
                    <AccountEmptySlotRow
                      key={slot.id}
                      slot={slot}
                      onAdd={() => openAddFromSlot(slot.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="brand-card-footer">
              <button
                type="button"
                className="brand-card-export-btn"
                disabled={group.accounts.length === 0}
                onClick={handleExportBrand}
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                {t('groupMonitoring.accountCard.export')}
              </button>
            </footer>
          </>
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
    </>
  );
}
