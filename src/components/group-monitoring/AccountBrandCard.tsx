import { ChevronDown, Download } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
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

interface AccountBrandCardProps {
  group: AccountBrandGroup;
  onAddAccount: (input: AddAccountInput) => Promise<void>;
  defaultExpanded?: boolean;
}

export function AccountBrandCard({
  group,
  onAddAccount,
  defaultExpanded = true,
}: AccountBrandCardProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [addPlatform, setAddPlatform] = useState<Platform | null>(null);
  const [addSlotId, setAddSlotId] = useState<string | undefined>();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
        phoneOrUsername: values.phoneOrUsername,
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
              {t('groupMonitoring.accountCard.brandTitle', {
                label: group.brandLabel,
                name: group.brandName,
              })}
            </span>
          </button>

          <div className="brand-card-header-actions">
            <span className="brand-card-badge brand-card-badge--neutral">
              {t('groupMonitoring.accountCard.accountCount', { count: group.accountCount })}
            </span>
            <span className="brand-card-badge brand-card-badge--neutral">
              {t('groupMonitoring.accountCard.standardGroups', { count: group.standardGroupCount })}
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
                    <AccountTableRow key={row.id} row={row} />
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
              <button type="button" className="brand-card-export-btn">
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
