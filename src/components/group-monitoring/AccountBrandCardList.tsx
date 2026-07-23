import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AccountBrandCard } from '@/components/group-monitoring/AccountBrandCard';
import type { EditAccountFormValues } from '@/components/group-monitoring/EditAccountModal';
import { AddBrandCard } from '@/components/group-monitoring/AddBrandCard';
import { RemoveBrandModal } from '@/components/group-monitoring/RemoveBrandModal';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import type { useAccountSyncFlow } from '@/hooks/useAccountSyncFlow';
import { addAccountToGroup, patchAccountDetailsInGroups } from '@/lib/accountBrandUtils';
import { commitAccountDetailsEdit } from '@/lib/commitAccountDetailsEdit';
import { removeBrandCompletely } from '@/lib/brands';
import { getErrorMessage } from '@/lib/errorMessage';
import { createMessagingAccount } from '@/lib/messagingAccounts';
import { useLanguage } from '@/hooks/useLanguage';
import { readGroupStockCounts } from '@/lib/classifyGroupStock';
import { buildStockHeaderMeta } from '@/lib/buildStockHeaderMeta';
import { loadAvgNewDepositorByLine } from '@/lib/loadAvgNewDepositor';
import { loadMasterGroupCountsByBrandPlatform, readMasterGroupCount } from '@/lib/loadOperationsMasterCounts';
import { loadOperationsStockCountsByBrandPlatform } from '@/lib/loadOperationsStockCounts';
import {
  readOperationsPolicyByBrand,
  type OperationsPolicyByBrand,
} from '@/config/operationsStockPolicy';
import type { AccountBrandGroup, AccountBrandRow, AddAccountInput } from '@/types/accountMonitoringUi';
import type { AccountPlatformFilter } from '@/lib/brandCardHeaderBadges';
import type { GroupStockCounts, GroupStockHeaderMeta } from '@/types/groupStock';
import { EMPTY_GROUP_STOCK_HEADER_META } from '@/types/groupStock';
import type { Platform } from '@/types/database';

type SyncFlow = ReturnType<typeof useAccountSyncFlow>;

interface AccountBrandCardListProps {
  groups: AccountBrandGroup[];
  activePlatformFilter?: AccountPlatformFilter;
  onOpenAddBrand?: () => void;
  onGroupsChange: Dispatch<SetStateAction<AccountBrandGroup[]>>;
  sync: SyncFlow;
  onRemoveFromSlot: (groupId: string, account: AccountBrandRow) => void;
}

function resolveListPlatform(filter: AccountPlatformFilter): Platform {
  return filter === 'telegram' ? 'telegram' : 'whatsapp';
}

export function AccountBrandCardList({
  groups,
  activePlatformFilter = 'whatsapp',
  onOpenAddBrand,
  onGroupsChange,
  sync,
  onRemoveFromSlot,
}: AccountBrandCardListProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { canManageStructure, canOperatePlatform } = usePermissions();
  const [removeTarget, setRemoveTarget] = useState<AccountBrandGroup | null>(null);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [stockByBrandPlatform, setStockByBrandPlatform] = useState<Map<string, GroupStockCounts>>(
    () => new Map(),
  );
  const [masterCounts, setMasterCounts] = useState<Map<string, number>>(() => new Map());
  const [avgNdByLine, setAvgNdByLine] = useState<Map<string, number>>(() => new Map());
  const [operationsPolicyByBrand, setOperationsPolicyByBrand] = useState<OperationsPolicyByBrand>(
    () => readOperationsPolicyByBrand(),
  );
  const [stockMetaReady, setStockMetaReady] = useState(false);
  const reloadSeqRef = useRef(0);
  const headerPlatform = resolveListPlatform(activePlatformFilter);

  const reloadStockMeta = useCallback(async () => {
    const brandNames = [...new Set(groups.map((g) => g.brandName.trim()).filter(Boolean))];
    const seq = ++reloadSeqRef.current;
    try {
      const [stock, master, avgNd] = await Promise.all([
        loadOperationsStockCountsByBrandPlatform(),
        loadMasterGroupCountsByBrandPlatform(),
        loadAvgNewDepositorByLine(brandNames),
      ]);
      if (seq !== reloadSeqRef.current) return;
      setStockByBrandPlatform(stock);
      setMasterCounts(master);
      setAvgNdByLine(avgNd);
      setOperationsPolicyByBrand(readOperationsPolicyByBrand());
      setStockMetaReady(true);
    } catch {
      if (seq !== reloadSeqRef.current) return;
      setStockByBrandPlatform(new Map());
      setMasterCounts(new Map());
      setAvgNdByLine(new Map());
      setStockMetaReady(false);
    }
  }, [groups]);

  useEffect(() => {
    void reloadStockMeta();
  }, [reloadStockMeta]);

  useEffect(() => {
    const onReload = () => void reloadStockMeta();
    window.addEventListener('rm-operations-reload', onReload);
    return () => window.removeEventListener('rm-operations-reload', onReload);
  }, [reloadStockMeta]);

  useEffect(() => {
    const onPolicyChanged = () => {
      setOperationsPolicyByBrand(readOperationsPolicyByBrand());
      // Avg ND window + prefix SOP butuh reload angka/chip (bukan hanya state policy).
      void reloadStockMeta();
    };
    window.addEventListener('rm-operations-policy-changed', onPolicyChanged);
    return () => window.removeEventListener('rm-operations-policy-changed', onPolicyChanged);
  }, [reloadStockMeta]);

  function stockHeaderMetaFor(brandName: string): GroupStockHeaderMeta {
    if (!stockMetaReady) {
      return EMPTY_GROUP_STOCK_HEADER_META;
    }
    return buildStockHeaderMeta(
      brandName,
      headerPlatform,
      masterCounts,
      stockByBrandPlatform,
      avgNdByLine,
      operationsPolicyByBrand,
    );
  }

  function masterGroupCountFor(brandName: string): number {
    if (!stockMetaReady) {
      const fromGrid = groups.find((g) => g.brandName === brandName)?.standardGroupCountByPlatform?.[
        headerPlatform
      ];
      return Math.max(0, Number(fromGrid) || 0);
    }
    return readMasterGroupCount(masterCounts, brandName, headerPlatform);
  }

  const {
    processingByAccount,
    clearingSessionAccountId,
    handleSyncAccount,
    handleClearSession,
    requestCancelScrape,
    getScrapeProgress,
  } = sync;

  async function handleAddAccount(group: AccountBrandGroup, input: AddAccountInput) {
    if (!canManageStructure) return;

    let dbAccountId: string | undefined;
    if (user?.id) {
      dbAccountId = await createMessagingAccount({
        userId: user.id,
        platform: input.platform,
        label: input.accountName,
        phoneNumber: input.phoneNumber,
        locationDevice: input.locationDevice,
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

  async function handleEditAccount(
    group: AccountBrandGroup,
    account: AccountBrandRow,
    values: EditAccountFormValues,
  ) {
    if (!canManageStructure) return;

    const normalized = await commitAccountDetailsEdit({
      userId: user?.id,
      brandName: group.brandName,
      account,
      values,
    });

    onGroupsChange((prev) =>
      patchAccountDetailsInGroups(prev, group.id, account.id, normalized),
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
      window.dispatchEvent(new Event('rm-operations-reload'));
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
            activePlatformFilter={activePlatformFilter}
            masterGroupCount={masterGroupCountFor(group.brandName)}
            stockCounts={readGroupStockCounts(
              stockByBrandPlatform,
              group.brandName,
              headerPlatform,
            )}
            stockHeaderMeta={stockHeaderMetaFor(group.brandName)}
            onAddAccount={(input) => handleAddAccount(group, input)}
            onEditAccount={(account, values) => handleEditAccount(group, account, values)}
            canManageStructure={canManageStructure}
            canOperatePlatform={canOperatePlatform}
            onSyncAccount={(accountId) => {
              const account = group.accounts.find((row) => row.id === accountId);
              if (account) handleSyncAccountForGroup(group, account);
            }}
            onClearSession={(accountId) => {
              if (!canOperatePlatform) return;
              const account = group.accounts.find((row) => row.id === accountId);
              if (account) void handleClearSession(group.id, account);
            }}
            onRemoveFromSlot={(account) => onRemoveFromSlot(group.id, account)}
            clearingSessionAccountId={clearingSessionAccountId}
            onCancelScrape={(accountId) => {
              if (!canOperatePlatform) return;
              const account = group.accounts.find((row) => row.id === accountId);
              if (account) requestCancelScrape(group.id, account);
            }}
            processingByAccount={processingByAccount}
            getScrapeProgress={getScrapeProgress}
            onDismiss={() => openRemoveBrandModal(group)}
          />
        ))}
        <AddBrandCard
          locked={!canManageStructure}
          onClick={() => onOpenAddBrand?.()}
        />
      </div>

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
