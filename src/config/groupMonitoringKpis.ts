export type KpiTone = 'default' | 'success' | 'danger' | 'warning';

export interface KpiItem {
  value: number;
  labelKey: string;
  tone?: KpiTone;
}

export const ACCOUNT_KPIS: KpiItem[] = [
  { value: 3, labelKey: 'kpi.account.brands' },
  { value: 7, labelKey: 'kpi.account.accounts' },
  { value: 6, labelKey: 'kpi.account.active', tone: 'success' },
  { value: 4, labelKey: 'kpi.account.aligned', tone: 'success' },
  { value: 3, labelKey: 'kpi.account.issue', tone: 'danger' },
];

export const TICKET_KPIS: KpiItem[] = [
  { value: 4, labelKey: 'kpi.ticket.open', tone: 'danger' },
  { value: 2, labelKey: 'kpi.ticket.missingGroup', tone: 'danger' },
  { value: 2, labelKey: 'kpi.ticket.notAdmin', tone: 'warning' },
  { value: 3, labelKey: 'kpi.ticket.accountsInvolved' },
  { value: 2, labelKey: 'kpi.ticket.brandsInvolved' },
];
