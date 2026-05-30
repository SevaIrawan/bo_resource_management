import { ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountViewMode } from '@/types/accountMonitoringUi';

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

const FILTER_DEFAULT = {
  brand: 'all',
  platform: 'all',
  status: 'all',
  adminStatus: 'all',
  search: '',
};

export function AccountSlicerHeader({ viewMode, onViewModeChange }: AccountSlicerHeaderProps) {
  const { t } = useLanguage();
  const [filters, setFilters] = useState(FILTER_DEFAULT);

  const patchFilters = (partial: Partial<typeof FILTER_DEFAULT>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const brandOptions = [
    { value: 'all', label: t('groupMonitoring.filters.allBrands') },
  ];

  const platformOptions = [
    { value: 'all', label: t('groupMonitoring.filters.allPlatforms') },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'telegram', label: 'Telegram' },
  ];

  const statusOptions = [
    { value: 'all', label: t('groupMonitoring.filters.allStatus') },
    { value: 'active', label: t('groupMonitoring.status.active') },
    { value: 'left', label: t('groupMonitoring.status.left') },
    { value: 'banned', label: t('groupMonitoring.status.banned') },
    { value: 'broken', label: t('groupMonitoring.status.broken') },
    { value: 'empty', label: t('groupMonitoring.status.empty') },
    { value: 'error', label: t('groupMonitoring.status.error') },
  ];

  const adminOptions = [
    { value: 'all', label: t('groupMonitoring.filters.allAdmin') },
    { value: 'yes', label: t('groupMonitoring.filters.adminYes') },
    { value: 'no', label: t('groupMonitoring.filters.adminNo') },
  ];

  return (
    <div className="account-slicer-row">
      <div className="account-slicer-left">
        <div className="account-slicer-search-group">
          <input
            type="search"
            value={filters.search}
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
            value={filters.brand}
            onChange={(brand) => patchFilters({ brand })}
            options={brandOptions}
          />
          <SlicerSelect
            value={filters.platform}
            onChange={(platform) => patchFilters({ platform })}
            options={platformOptions}
          />
          <SlicerSelect
            value={filters.status}
            onChange={(status) => patchFilters({ status })}
            options={statusOptions}
          />
          <SlicerSelect
            value={filters.adminStatus}
            onChange={(adminStatus) => patchFilters({ adminStatus })}
            options={adminOptions}
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
