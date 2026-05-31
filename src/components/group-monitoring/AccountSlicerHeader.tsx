import { ChevronDown, Search } from 'lucide-react';
import { useMemo } from 'react';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';
import {
  uniqueAccountBrands,
  uniqueAccountPlatforms,
  uniqueAccountStatuses,
} from '@/lib/filterAccountGroups';
import { cn } from '@/lib/utils';
import type { AccountConnectionStatus, AccountViewMode } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export type { AccountViewMode };

interface AccountSlicerHeaderProps {
  viewMode: AccountViewMode;
  onViewModeChange: (mode: AccountViewMode) => void;
}

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}

function SlicerSelect({ value, onChange, options, className }: FilterSelectProps) {
  return (
    <div className={cn('account-slicer-select-wrap', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="account-slicer-select"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="account-slicer-select-icon" aria-hidden />
    </div>
  );
}

function statusLabel(
  t: (key: string) => string,
  status: AccountConnectionStatus,
): string {
  return status === 'active'
    ? t('groupMonitoring.accountCard.statusActive')
    : t('groupMonitoring.accountCard.statusLogout');
}

function platformLabel(t: (key: string) => string, platform: Platform): string {
  return platform === 'whatsapp'
    ? t('groupMonitoring.platform.whatsapp')
    : t('groupMonitoring.platform.telegram');
}

export function AccountSlicerHeader({ viewMode, onViewModeChange }: AccountSlicerHeaderProps) {
  const { t } = useLanguage();
  const { groups, accountFilters, setAccountFilters } = useGroupMonitoring();

  const patchFilters = (partial: Partial<typeof accountFilters>) => {
    setAccountFilters((prev) => ({ ...prev, ...partial }));
  };

  const brandOptions = useMemo(() => {
    const brands = uniqueAccountBrands(groups);
    return [
      { value: 'all', label: t('groupMonitoring.filters.allBrands') },
      ...brands.map((name) => ({ value: name, label: name })),
    ];
  }, [groups, t]);

  const platformOptions = useMemo(() => {
    const platforms = uniqueAccountPlatforms(groups);
    return [
      { value: 'all', label: t('groupMonitoring.filters.allPlatforms') },
      ...platforms.map((value) => ({
        value,
        label: platformLabel(t, value),
      })),
    ];
  }, [groups, t]);

  const statusOptions = useMemo(() => {
    const statuses = uniqueAccountStatuses(groups);
    return [
      { value: 'all', label: t('groupMonitoring.filters.allStatus') },
      ...statuses.map((value) => ({
        value,
        label: statusLabel(t, value),
      })),
    ];
  }, [groups, t]);

  return (
    <div className="account-slicer-row">
      <div className="account-slicer-left">
        <div className="account-slicer-search-group">
          <input
            type="search"
            value={accountFilters.search}
            onChange={(e) => patchFilters({ search: e.target.value })}
            placeholder={t('groupMonitoring.searchPlaceholder')}
            className="account-slicer-search"
          />
          <button
            type="button"
            className="account-slicer-search-btn"
            aria-label={t('groupMonitoring.searchSubmit')}
          >
            <Search className="h-3.5 w-3.5" strokeWidth={2} />
            {t('groupMonitoring.searchSubmit')}
          </button>
        </div>
      </div>

      <div className="account-slicer-right">
        <div className="account-slicer-filters">
          <SlicerSelect
            value={accountFilters.brand}
            onChange={(brand) => patchFilters({ brand })}
            options={brandOptions}
          />
          <SlicerSelect
            value={accountFilters.platform}
            onChange={(platform) => patchFilters({ platform })}
            options={platformOptions}
          />
          <SlicerSelect
            value={accountFilters.status}
            onChange={(status) => patchFilters({ status })}
            options={statusOptions}
          />
        </div>

        <div className="account-slicer-view-toggle" role="group" aria-label={t('groupMonitoring.viewToggle')}>
          {(['card', 'table'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onViewModeChange(mode)}
              className={cn(
                'account-slicer-view-btn',
                viewMode === mode && 'account-slicer-view-btn--active',
              )}
            >
              {mode === 'card'
                ? t('groupMonitoring.viewCard')
                : t('groupMonitoring.viewTable')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
