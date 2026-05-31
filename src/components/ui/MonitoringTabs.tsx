import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import type { MonitoringTab } from '@/types/monitoring';

export type { MonitoringTab };

interface MonitoringTabsProps {
  value: MonitoringTab;
  onChange: (value: MonitoringTab) => void;
  ticketCount?: number;
}

const TAB_IDS: MonitoringTab[] = ['account', 'ticket'];

const TAB_LABEL_KEYS: Record<MonitoringTab, string> = {
  account: 'tabs.account',
  ticket: 'tabs.ticket',
};

export function MonitoringTabs({
  value,
  onChange,
  ticketCount = 0,
}: MonitoringTabsProps) {
  const { t } = useLanguage();

  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-bg-base p-1">
      {TAB_IDS.map((id) => {
        const isActive = value === id;
        const label = t(TAB_LABEL_KEYS[id]);
        const displayLabel =
          id === 'ticket' && ticketCount > 0 ? `${label} (${ticketCount})` : label;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              'monitoring-tab-btn rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              id === 'account' && 'monitoring-tab-btn--account',
              id === 'ticket' && 'monitoring-tab-btn--ticket',
              isActive
                ? 'bg-bg-shell text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {displayLabel}
          </button>
        );
      })}
    </div>
  );
}

/** @deprecated Pakai MonitoringTab */
export type PlatformTab = MonitoringTab;

/** @deprecated Pakai MonitoringTabs */
export const PlatformTabs = MonitoringTabs;
