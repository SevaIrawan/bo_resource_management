import type { KpiItem } from '@/config/groupMonitoringKpis';
import type { TicketSummaryGroup } from '@/lib/ticketGroups';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

export function computeAccountKpis(
  groups: AccountBrandGroup[],
  openTicketIssues = 0,
): KpiItem[] {
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
  const issue = groups.reduce((n, g) => n + g.misalignedCount, 0);

  return [
    { value: brands, labelKey: 'kpi.account.brands' },
    { value: accounts, labelKey: 'kpi.account.accounts' },
    { value: active, labelKey: 'kpi.account.active', tone: 'success' },
    { value: aligned, labelKey: 'kpi.account.aligned', tone: 'success' },
    { value: issue, labelKey: 'kpi.account.issue', tone: 'danger' },
    { value: openTicketIssues, labelKey: 'kpi.account.openTickets', tone: 'danger' },
  ];
}

/** KPI dari issue ringkas (satu kartu per acc+brand+jenis), bukan jumlah baris DB. */
export function computeTicketKpis(summaries: TicketSummaryGroup[]): KpiItem[] {
  const open = summaries.length;
  const missingGroup = summaries.filter((t) => t.ticketType === 'missing_group').length;
  const notAdmin = summaries.filter((t) => t.ticketType === 'not_admin').length;
  const detailRows = summaries.reduce((n, s) => n + s.itemCount, 0);
  const accountsInvolved = new Set(summaries.map((t) => t.accountName)).size;
  const brandsInvolved = new Set(summaries.map((t) => t.brandName)).size;

  return [
    { value: open, labelKey: 'kpi.ticket.open', tone: 'danger' },
    { value: missingGroup, labelKey: 'kpi.ticket.missingGroup', tone: 'danger' },
    { value: notAdmin, labelKey: 'kpi.ticket.notAdmin', tone: 'warning' },
    { value: detailRows, labelKey: 'kpi.ticket.detailRows' },
    { value: accountsInvolved, labelKey: 'kpi.ticket.accountsInvolved' },
    { value: brandsInvolved, labelKey: 'kpi.ticket.brandsInvolved' },
  ];
}
