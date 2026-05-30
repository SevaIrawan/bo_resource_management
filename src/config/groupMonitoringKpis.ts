export type KpiTone = 'default' | 'success' | 'danger';

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
  { value: 4, labelKey: 'kpi.ticket.total' },
  { value: 2, labelKey: 'kpi.ticket.pending', tone: 'danger' },
  { value: 1, labelKey: 'kpi.ticket.processing' },
  { value: 1, labelKey: 'kpi.ticket.done', tone: 'success' },
  { value: 0, labelKey: 'kpi.ticket.closed' },
];
