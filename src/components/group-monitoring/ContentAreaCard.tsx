import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AccountSlicerHeader } from '@/components/group-monitoring/AccountSlicerHeader';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountSlicerFilters } from '@/lib/filterAccountGroups';
import type { AccountBrandGroup, AccountViewMode } from '@/types/accountMonitoringUi';
import type { Dispatch, SetStateAction } from 'react';

interface ContentAreaCardProps {
  children: ReactNode;
  accountViewMode?: AccountViewMode;
  onAccountViewModeChange?: (mode: AccountViewMode) => void;
  onQuickAddBrand?: () => void;
  groups: AccountBrandGroup[];
  filteredGroups: AccountBrandGroup[];
  accountFilters: AccountSlicerFilters;
  setAccountFilters: Dispatch<SetStateAction<AccountSlicerFilters>>;
}

export function ContentAreaCard({
  children,
  accountViewMode = 'card',
  onAccountViewModeChange,
  onQuickAddBrand,
  groups,
  filteredGroups,
  accountFilters,
  setAccountFilters,
}: ContentAreaCardProps) {
  return (
    <section className="content-area-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
      <header className="content-area-header shrink-0">
        <AccountSlicerBar>
          <AccountSlicerHeader
            viewMode={accountViewMode}
            onViewModeChange={onAccountViewModeChange ?? (() => undefined)}
            onQuickAddBrand={onQuickAddBrand}
            groups={groups}
            filteredGroups={filteredGroups}
            accountFilters={accountFilters}
            setAccountFilters={setAccountFilters}
          />
        </AccountSlicerBar>
      </header>

      <div className="content-area-body flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </section>
  );
}

export function AccountSlicerBar({ children }: { children?: ReactNode }) {
  const { t } = useLanguage();

  return (
    <div
      className="content-slicer-bar flex min-h-12 flex-wrap items-center gap-3 px-5 py-3"
      data-slicer="account"
      aria-label={t('groupMonitoring.accountFilters')}
    >
      {children}
    </div>
  );
}

export function ContentNestedPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('content-nested-panel', className)}>{children}</div>
  );
}
