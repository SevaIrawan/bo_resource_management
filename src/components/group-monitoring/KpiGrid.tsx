import { KpiCard } from '@/components/ui/KpiCard';
import type { KpiItem } from '@/config/groupMonitoringKpis';

interface KpiGridProps {
  items: KpiItem[];
}

export function KpiGrid({ items }: KpiGridProps) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-(--layout-gap) md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <KpiCard
          key={item.labelKey}
          value={item.value}
          labelKey={item.labelKey}
          tone={item.tone}
        />
      ))}
    </div>
  );
}
