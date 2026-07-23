import type { KpiItem } from '@/config/groupMonitoringKpis';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

export function computeAccountKpis(groups: AccountBrandGroup[]): KpiItem[] {
  const brands = groups.length;
  const accounts = groups.reduce((n, g) => n + g.accounts.length, 0);
  const logout = groups.reduce(
    (n, g) => n + g.accounts.filter((a) => a.sessionStatus === 'invalid').length,
    0,
  );
  const notAligned = groups.reduce(
    (n, g) => n + g.accounts.filter((a) => a.isMisaligned).length,
    0,
  );

  return [
    { value: brands, labelKey: 'kpi.account.brands' },
    { value: accounts, labelKey: 'kpi.account.accounts' },
    { value: logout, labelKey: 'kpi.account.logout', tone: logout > 0 ? 'danger' : 'default' },
    {
      value: notAligned,
      labelKey: 'kpi.account.notAligned',
      tone: notAligned > 0 ? 'danger' : 'default',
    },
  ];
}
