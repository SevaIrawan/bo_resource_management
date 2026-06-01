import { useState } from 'react';
import { AccountBrandCard } from '@/components/group-monitoring/AccountBrandCard';
import { AddBrandCard } from '@/components/group-monitoring/AddBrandCard';
import { AddBrandModal } from '@/components/group-monitoring/AddBrandModal';
import { useAuth } from '@/hooks/useAuth';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import type { useAccountSyncFlow } from '@/hooks/useAccountSyncFlow';
import { addAccountToGroup, createEmptyBrandGroup } from '@/lib/accountBrandUtils';
import { ensureBrand } from '@/lib/brands';
import { createMessagingAccount } from '@/lib/messagingAccounts';
import type { AccountBrandGroup, AccountBrandRow, AddAccountInput } from '@/types/accountMonitoringUi';
type SyncFlow = ReturnType<typeof useAccountSyncFlow>;

interface AccountBrandCardListProps {
  groups: AccountBrandGroup[];
  onGroupsChange: (groups: AccountBrandGroup[]) => void;
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
  const { dismissBrandGroup } = useGroupMonitoring();
  const [modalOpen, setModalOpen] = useState(false);

  const { processingAccountId, processingAction, handleSyncAccount, handleRunScraper, getScrapeProgress } =
    sync;

  async function handleAddBrand(brandName: string) {
    let dbBrandId: string | undefined;
    if (user?.id) {
      const brand = await ensureBrand({ userId: user.id, brandName });
      dbBrandId = brand.id;
    }
    const nextGroup = { ...createEmptyBrandGroup(brandName), dbBrandId };
    onGroupsChange([...groups, nextGroup]);
  }

  async function handleAddAccount(groupId: string, input: AddAccountInput) {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;

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

    onGroupsChange(
      groups.map((item) =>
        item.id === groupId ? addAccountToGroup(item, { ...input, dbAccountId }) : item,
      ),
    );
  }

  function handleSyncByAccountId(groupId: string, accountId: string) {
    const group = groups.find((item) => item.id === groupId);
    const account = group?.accounts.find((row) => row.id === accountId);
    if (!account) return;

    handleSyncAccount(groupId, account);
  }

  return (
    <>
      <div className="brand-card-list">
        {groups.map((group) => (
          <AccountBrandCard
            key={group.id}
            group={group}
            onAddAccount={(input) => handleAddAccount(group.id, input)}
            onSyncAccount={(accountId) => handleSyncByAccountId(group.id, accountId)}
            onRemoveFromSlot={(account) => onRemoveFromSlot(group.id, account)}
            onRunScraper={(accountId) => {
              const account = group.accounts.find((row) => row.id === accountId);
              if (account) void handleRunScraper(group.id, account);
            }}
            checkingAccountId={
              processingAction === 'sync' ? processingAccountId : null
            }
            scraperAccountId={
              processingAction === 'scraper' ? processingAccountId : null
            }
            getScrapeProgress={getScrapeProgress}
            onDismiss={() => dismissBrandGroup(group.id)}
          />
        ))}
        <AddBrandCard onClick={() => setModalOpen(true)} />
      </div>

      <AddBrandModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleAddBrand}
      />
    </>
  );
}
