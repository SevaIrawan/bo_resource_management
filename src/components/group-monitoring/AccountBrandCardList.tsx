import { useState } from 'react';
import { AccountBrandCard } from '@/components/group-monitoring/AccountBrandCard';
import { AddBrandCard } from '@/components/group-monitoring/AddBrandCard';
import { AddBrandModal } from '@/components/group-monitoring/AddBrandModal';
import { useAuth } from '@/hooks/useAuth';
import { addAccountToGroup, createEmptyBrandGroup, nextBrandLabel } from '@/lib/accountBrandUtils';
import { createMessagingAccount } from '@/lib/messagingAccounts';
import type { AccountBrandGroup, AddAccountInput } from '@/types/accountMonitoringUi';

interface AccountBrandCardListProps {
  groups: AccountBrandGroup[];
  onGroupsChange: (groups: AccountBrandGroup[]) => void;
}

export function AccountBrandCardList({ groups, onGroupsChange }: AccountBrandCardListProps) {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  function handleAddBrand(brandName: string) {
    const label = nextBrandLabel(groups);
    const nextGroup = createEmptyBrandGroup(brandName, label);
    onGroupsChange([...groups, nextGroup]);
  }

  async function handleAddAccount(groupId: string, input: AddAccountInput) {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;

    onGroupsChange(
      groups.map((item) =>
        item.id === groupId ? addAccountToGroup(item, input) : item,
      ),
    );

    if (user?.id) {
      void createMessagingAccount({
        userId: user.id,
        platform: input.platform,
        label: input.accountName,
        phoneOrUsername: input.phoneOrUsername,
        brand: group.brandName,
      }).catch((error) => {
        console.warn('[RM] Account saved to list; database write deferred:', error);
      });
    }
  }

  return (
    <>
      <div className="brand-card-list">
        {groups.map((group) => (
          <AccountBrandCard
            key={group.id}
            group={group}
            onAddAccount={(input) => handleAddAccount(group.id, input)}
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
