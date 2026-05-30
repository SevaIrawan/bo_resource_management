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
};

export function KpiCard({ value, labelKey, tone = 'default' }: KpiCardProps) {
  const { t } = useLanguage();

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-card px-5 py-4">
      <p className={cn('text-3xl font-semibold leading-none tabular-nums', VALUE_TONE[tone])}>
        {value}
      </p>
      <p className="mt-2 text-xs leading-snug text-text-muted">{t(labelKey)}</p>
    </div>
  );
}
