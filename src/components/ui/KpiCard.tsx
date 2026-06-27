import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import type { KpiTone } from '@/config/groupMonitoringKpis';

interface KpiCardProps {
  value: string | number;
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
  const isNumber = typeof value === 'number';

  return (
    <div className="kpi-card kpi-card--compact rounded-xl border border-border-subtle bg-bg-card px-4 py-2">
      <p
        className={cn(
          'font-semibold leading-none tabular-nums',
          isNumber ? 'text-2xl' : 'truncate text-lg',
          VALUE_TONE[tone],
        )}
      >
        {value}
      </p>
      <p className="kpi-card-label mt-1 text-xs leading-tight text-text-muted">{t(labelKey)}</p>
    </div>
  );
}
