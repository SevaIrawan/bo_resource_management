import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import type { MonitoringTab } from '@/types/monitoring';

export type { MonitoringTab };

interface MonitoringTabsProps {
  value: MonitoringTab;
  onChange: (value: MonitoringTab) => void;
  ticketCount?: number;
}

/** Urutan tab: Account → Operations → Ticketing → Reporting */
const TAB_IDS: MonitoringTab[] = ['account', 'operations', 'ticket', 'reporting'];

const TAB_LABEL_KEYS: Record<MonitoringTab, string> = {
  account: 'tabs.account',
  operations: 'tabs.operations',
  ticket: 'tabs.ticket',
  reporting: 'tabs.reporting',
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
        const showTicketBadge = id === 'ticket' && ticketCount > 0;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              'monitoring-tab-btn inline-flex items-center gap-0.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              id === 'account' && 'monitoring-tab-btn--account',
              id === 'operations' && 'monitoring-tab-btn--operations',
              id === 'ticket' && 'monitoring-tab-btn--ticket',
              id === 'reporting' && 'monitoring-tab-btn--reporting',
              isActive
                ? 'bg-bg-shell text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {label}
            {showTicketBadge ? (
              <span className="monitoring-tab-badge" aria-label={String(ticketCount)}>
                ({ticketCount})
              </span>
            ) : null}
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
