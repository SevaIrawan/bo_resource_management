import { useCallback, useState } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { removeAccountFromGroup } from '@/lib/accountBrandUtils';
import { deactivateMessagingAccount } from '@/lib/messagingAccounts';
import { getErrorMessage } from '@/lib/errorMessage';
import { patchBrandPlatformMasterInGroups } from '@/lib/patchAccountMasterInGroups';
import type { Dispatch, SetStateAction } from 'react';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';

interface RemoveTarget {
  groupId: string;
  account: AccountBrandRow;
}

export function useRemoveAccountFromSlot(
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>,
  userId: string | null | undefined,
  canManageStructure = true,
) {
  const { t } = useLanguage();
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const openRemoveModal = useCallback(
    (groupId: string, account: AccountBrandRow) => {
      if (!canManageStructure) return;
      setRemoveError(null);
      setRemoveTarget({ groupId, account });
    },
    [canManageStructure],
  );

  const closeRemoveModal = useCallback(() => {
    if (removeSaving) return;
    setRemoveTarget(null);
    setRemoveError(null);
  }, [removeSaving]);

  const commitRemoveFromSlot = useCallback(async () => {
    if (!canManageStructure || !removeTarget) return;

    const { groupId, account } = removeTarget;
    setRemoveSaving(true);
    setRemoveError(null);

    try {
      if (userId) {
        await deactivateMessagingAccount(account.id, account.platform);
      }

      let groupsAfterRemove: AccountBrandGroup[] = [];
      onGroupsChange((prev) => {
        groupsAfterRemove = prev.map((item) =>
          item.id === groupId ? removeAccountFromGroup(item, account.id) : item,
        );
        return groupsAfterRemove;
      });

      if (userId && groupsAfterRemove.length > 0) {
        const patched = await patchBrandPlatformMasterInGroups(
          groupsAfterRemove,
          account.brandName,
          account.platform,
        );
        if (patched !== groupsAfterRemove) {
          onGroupsChange(() => patched);
        }
      }

      setRemoveTarget(null);
    } catch (error) {
      setRemoveError(
        getErrorMessage(error, t('groupMonitoring.accountCard.removeAccountFailed')),
      );
    } finally {
      setRemoveSaving(false);
    }
  }, [canManageStructure, onGroupsChange, removeTarget, userId, t]);

  return {
    removeTarget,
    removeSaving,
    removeError,
    openRemoveModal,
    closeRemoveModal,
    commitRemoveFromSlot,
  };
}
