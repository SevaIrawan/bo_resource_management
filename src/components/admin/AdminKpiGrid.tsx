import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import type { KpiTone } from '@/config/groupMonitoringKpis';

export interface AdminKpiItem {
  id: string;
  value: string | number;
  labelKey: string;
  tone?: KpiTone;
}

interface AdminKpiCardProps {
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

export function AdminKpiCard({ value, labelKey, tone = 'default' }: AdminKpiCardProps) {
  const { t } = useLanguage();
  const isNumber = typeof value === 'number';

  return (
    <div className="kpi-card rounded-xl border border-border-subtle bg-bg-card px-5 py-4">
      <p
        className={cn(
          'font-semibold leading-none tabular-nums',
          isNumber ? 'text-3xl' : 'truncate text-xl',
          VALUE_TONE[tone],
        )}
      >
        {value}
      </p>
      <p className="kpi-card-label mt-2 text-xs leading-snug text-text-muted">{t(labelKey)}</p>
    </div>
  );
}

interface AdminKpiGridProps {
  items: AdminKpiItem[];
}

export function AdminKpiGrid({ items }: AdminKpiGridProps) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-(--layout-gap) md:grid-cols-4">
      {items.map((item) => (
        <AdminKpiCard
          key={item.id}
          value={item.value}
          labelKey={item.labelKey}
          tone={item.tone}
        />
      ))}
    </div>
  );
}
