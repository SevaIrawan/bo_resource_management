import type { KpiItem } from '@/config/groupMonitoringKpis';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

export function computeAccountKpis(groups: AccountBrandGroup[]): KpiItem[] {
  const brands = groups.length;
  const accounts = groups.reduce((n, g) => n + g.accounts.length, 0);
  const active = groups.reduce(
    (n, g) => n + g.accounts.filter((a) => a.sessionStatus === 'valid').length,
    0,
  );
  const aligned = groups.reduce(
    (n, g) => n + g.accounts.filter((a) => !a.isMisaligned && a.syncState === 'synced').length,
    0,
  );

  return [
    { value: brands, labelKey: 'kpi.account.brands' },
    { value: accounts, labelKey: 'kpi.account.accounts' },
    { value: active, labelKey: 'kpi.account.active', tone: 'success' },
    { value: aligned, labelKey: 'kpi.account.aligned', tone: 'success' },
  ];
}
