import { useCallback, useState } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { removeAccountFromGroup } from '@/lib/accountBrandUtils';
import { deactivateMessagingAccount } from '@/lib/messagingAccounts';
import { getErrorMessage } from '@/lib/errorMessage';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';

interface RemoveTarget {
  groupId: string;
  account: AccountBrandRow;
}

export function useRemoveAccountFromSlot(
  groups: AccountBrandGroup[],
  onGroupsChange: (groups: AccountBrandGroup[]) => void,
  userId: string | null | undefined,
) {
  const { t } = useLanguage();
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const openRemoveModal = useCallback((groupId: string, account: AccountBrandRow) => {
    setRemoveError(null);
    setRemoveTarget({ groupId, account });
  }, []);

  const closeRemoveModal = useCallback(() => {
    if (removeSaving) return;
    setRemoveTarget(null);
    setRemoveError(null);
  }, [removeSaving]);

  const commitRemoveFromSlot = useCallback(async () => {
    if (!removeTarget) return;

    const { groupId, account } = removeTarget;
    setRemoveSaving(true);
    setRemoveError(null);

    try {
      if (userId) {
        await deactivateMessagingAccount(account.id, account.platform);
      }

      onGroupsChange(
        groups.map((item) =>
          item.id === groupId ? removeAccountFromGroup(item, account.id) : item,
        ),
      );

      setRemoveTarget(null);
    } catch (error) {
      setRemoveError(
        getErrorMessage(error, t('groupMonitoring.accountCard.removeAccountFailed')),
      );
    } finally {
      setRemoveSaving(false);
    }
  }, [groups, onGroupsChange, removeTarget, userId, t]);

  return {
    removeTarget,
    removeSaving,
    removeError,
    openRemoveModal,
    closeRemoveModal,
    commitRemoveFromSlot,
  };
}
