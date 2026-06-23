export type KpiTone = 'default' | 'success' | 'danger' | 'warning';

export interface KpiItem {
  value: number;
  labelKey: string;
  tone?: KpiTone;
}

export const ACCOUNT_KPIS: KpiItem[] = [
  { value: 0, labelKey: 'kpi.account.brands' },
  { value: 0, labelKey: 'kpi.account.accounts' },
  { value: 0, labelKey: 'kpi.account.active', tone: 'success' },
  { value: 0, labelKey: 'kpi.account.aligned', tone: 'success' },
];
