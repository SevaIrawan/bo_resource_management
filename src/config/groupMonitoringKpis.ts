export type KpiTone = 'default' | 'success' | 'danger' | 'warning';

export interface KpiItem {
  value: number;
  labelKey: string;
  tone?: KpiTone;
}
