import { useState } from 'react';
import { ACCOUNT_BRAND_MOCK } from '@/config/accountMonitoringMock';
import { AccountBrandCardList } from '@/components/group-monitoring/AccountBrandCardList';
import { AccountBrandTableView } from '@/components/group-monitoring/AccountBrandTableView';
import type { AccountBrandGroup, AccountViewMode } from '@/types/accountMonitoringUi';

interface AccountMonitoringBodyProps {
  viewMode: AccountViewMode;
}

export function AccountMonitoringBody({ viewMode }: AccountMonitoringBodyProps) {
  const [groups, setGroups] = useState<AccountBrandGroup[]>(() => ACCOUNT_BRAND_MOCK.slice(0, 3));

  if (viewMode === 'table') {
    return <AccountBrandTableView groups={groups} />;
  }

  return <AccountBrandCardList groups={groups} onGroupsChange={setGroups} />;
}
