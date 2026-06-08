import { useState, type Dispatch, type SetStateAction } from 'react';
import { AccountBrandCard } from '@/components/group-monitoring/AccountBrandCard';
import { AddBrandCard } from '@/components/group-monitoring/AddBrandCard';
import { AddBrandModal } from '@/components/group-monitoring/AddBrandModal';
import { RemoveBrandModal } from '@/components/group-monitoring/RemoveBrandModal';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import type { useAccountSyncFlow } from '@/hooks/useAccountSyncFlow';
import { addAccountToGroup, createEmptyBrandGroup } from '@/lib/accountBrandUtils';
import { ensureBrand, removeBrandCompletely } from '@/lib/brands';
import { getErrorMessage } from '@/lib/errorMessage';
import { createMessagingAccount } from '@/lib/messagingAccounts';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountBrandGroup, AccountBrandRow, AddAccountInput } from '@/types/accountMonitoringUi';

type SyncFlow = ReturnType<typeof useAccountSyncFlow>;

interface AccountBrandCardListProps {
  groups: AccountBrandGroup[];
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  sync: SyncFlow;
  onRemoveFromSlot: (groupId: string, account: AccountBrandRow) => void;
}

export function AccountBrandCardList({
  groups,
  onGroupsChange,
  sync,
  onRemoveFromSlot,
}: AccountBrandCardListProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { canManageStructure, canOperatePlatform } = usePermissions();
  const { refreshIssues } = useGroupMonitoring();
  const [modalOpen, setModalOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AccountBrandGroup | null>(null);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const { processingAccountId, processingAction, handleSyncAccount, handleRunScraper, requestCancelScrape, getScrapeProgress } =
    sync;

  async function handleAddBrand(brandName: string) {
    if (!canManageStructure) return;
    const name = brandName.trim();
    if (!name) return;

    let dbBrandId: string | undefined;
    if (user?.id) {
      const brand = await ensureBrand({ userId: user.id, brandName: name });
      dbBrandId = brand.id;
    }
    const nextGroup = { ...createEmptyBrandGroup(name, dbBrandId), dbBrandId };

    onGroupsChange((prev) => {
      const exists = prev.some(
        (g) =>
          g.brandName.trim().toLowerCase() === name.toLowerCase() ||
          (dbBrandId && g.dbBrandId === dbBrandId),
      );
      if (exists) return prev;
      return [...prev, nextGroup].sort((a, b) =>
        a.brandName.localeCompare(b.brandName),
      );
    });
  }

  async function handleAddAccount(group: AccountBrandGroup, input: AddAccountInput) {
    if (!canManageStructure) return;

    let dbAccountId: string | undefined;
    if (user?.id) {
      dbAccountId = await createMessagingAccount({
        userId: user.id,
        platform: input.platform,
        label: input.accountName,
        phoneNumber: input.phoneNumber,
        brand: group.brandName,
        brandId: group.dbBrandId,
      });
    }

    onGroupsChange((prev) =>
      prev.map((item) =>
        item.id === group.id ? addAccountToGroup(item, { ...input, dbAccountId }) : item,
      ),
    );
  }

  function handleSyncAccountForGroup(group: AccountBrandGroup, account: AccountBrandRow) {
    if (!canOperatePlatform) return;
    handleSyncAccount(group.id, account);
  }

  function openRemoveBrandModal(group: AccountBrandGroup) {
    if (!canManageStructure) return;
    setRemoveError(null);
    setRemoveTarget(group);
  }

  function closeRemoveBrandModal() {
    if (removeSaving) return;
    setRemoveTarget(null);
    setRemoveError(null);
  }

  async function commitRemoveBrand() {
    if (!canManageStructure || !removeTarget) return;

    const group = removeTarget;
    setRemoveSaving(true);
    setRemoveError(null);

    try {
      if (user?.id && group.dbBrandId) {
        await removeBrandCompletely({
          userId: user.id,
          brandId: group.dbBrandId,
          brandName: group.brandName,
        });
      }

      onGroupsChange((prev) => prev.filter((g) => g.id !== group.id));
      setRemoveTarget(null);
      void refreshIssues();
    } catch (error) {
      setRemoveError(getErrorMessage(error, t('groupMonitoring.removeBrandFailed')));
    } finally {
      setRemoveSaving(false);
    }
  }

  return (
    <>
      <div className="brand-card-list">
        {groups.map((group) => (
          <AccountBrandCard
            key={group.id}
            group={group}
            onAddAccount={(input) => handleAddAccount(group, input)}
            canManageStructure={canManageStructure}
            canOperatePlatform={canOperatePlatform}
            onSyncAccount={(accountId) => {
              const account = group.accounts.find((row) => row.id === accountId);
              if (account) handleSyncAccountForGroup(group, account);
            }}
            onRemoveFromSlot={(account) => onRemoveFromSlot(group.id, account)}
            onRunScraper={(accountId) => {
              if (!canOperatePlatform) return;
              const account = group.accounts.find((row) => row.id === accountId);
              if (account) void handleRunScraper(group.id, account);
            }}
            onCancelScrape={(accountId) => {
              if (!canOperatePlatform) return;
              const account = group.accounts.find((row) => row.id === accountId);
              if (account) requestCancelScrape(group.id, account);
            }}
            checkingAccountId={
              processingAction === 'sync' ? processingAccountId : null
            }
            scraperAccountId={
              processingAction === 'scraper' ? processingAccountId : null
            }
            getScrapeProgress={getScrapeProgress}
            onDismiss={() => openRemoveBrandModal(group)}
          />
        ))}
        <AddBrandCard
          locked={!canManageStructure}
          onClick={() => {
            if (!canManageStructure) return;
            setModalOpen(true);
          }}
        />
      </div>

      <AddBrandModal
        open={modalOpen && canManageStructure}
        onClose={() => setModalOpen(false)}
        onSubmit={handleAddBrand}
      />

      {removeTarget ? (
        <RemoveBrandModal
          open
          saving={removeSaving}
          error={removeError}
          onClose={closeRemoveBrandModal}
          onConfirm={() => void commitRemoveBrand()}
        />
      ) : null}
    </>
  );
}
