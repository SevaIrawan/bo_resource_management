import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import type { MonitoringTab } from '@/types/monitoring';

export type { MonitoringTab };

interface MonitoringTabsProps {
  value: MonitoringTab;
  onChange: (value: MonitoringTab) => void;
}

/** Urutan tab: Account → Operations → Reporting */
const TAB_IDS: MonitoringTab[] = ['account', 'operations', 'reporting'];

const TAB_LABEL_KEYS: Record<MonitoringTab, string> = {
  account: 'tabs.account',
  operations: 'tabs.operations',
  reporting: 'tabs.reporting',
};

export function MonitoringTabs({ value, onChange }: MonitoringTabsProps) {
  const { t } = useLanguage();

  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-bg-base p-1">
      {TAB_IDS.map((id) => {
        const isActive = value === id;
        const label = t(TAB_LABEL_KEYS[id]);

        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              'monitoring-tab-btn inline-flex items-center gap-0.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              id === 'account' && 'monitoring-tab-btn--account',
              id === 'operations' && 'monitoring-tab-btn--operations',
              id === 'reporting' && 'monitoring-tab-btn--reporting',
              isActive
                ? 'bg-bg-shell text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {label}
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
