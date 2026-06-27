import { KpiCard } from '@/components/ui/KpiCard';
import type { KpiTone } from '@/config/groupMonitoringKpis';

export interface AdminKpiItem {
  id: string;
  value: string | number;
  labelKey: string;
  tone?: KpiTone;
}

interface AdminKpiGridProps {
  items: AdminKpiItem[];
}

export function AdminKpiGrid({ items }: AdminKpiGridProps) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-(--layout-gap) md:grid-cols-4">
      {items.map((item) => (
        <KpiCard
          key={item.id}
          value={item.value}
          labelKey={item.labelKey}
          tone={item.tone}
        />
      ))}
    </div>
  );
}
