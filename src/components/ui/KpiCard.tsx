import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import type { KpiTone } from '@/config/groupMonitoringKpis';

interface KpiCardProps {
  value: number;
  labelKey: string;
  tone?: KpiTone;
}

const VALUE_TONE: Record<KpiTone, string> = {
  default: 'text-text-primary',
  success: 'text-wa',
  danger: 'text-danger',
  warning: 'text-amber-400',
};

export function KpiCard({ value, labelKey, tone = 'default' }: KpiCardProps) {
  const { t } = useLanguage();

  return (
    <div className="kpi-card kpi-card--compact rounded-xl border border-border-subtle bg-bg-card px-4 py-2">
      <p className={cn('text-2xl font-semibold leading-none tabular-nums', VALUE_TONE[tone])}>
        {value}
      </p>
      <p className="kpi-card-label mt-1 text-xs leading-tight text-text-muted">{t(labelKey)}</p>
    </div>
  );
}
