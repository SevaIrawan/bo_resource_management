import { Download, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';
import { usePermissions } from '@/hooks/usePermissions';
import { exportAllAccountsExcel } from '@/lib/exportExcel';
import {
  uniqueAccountBrands,
  uniqueAccountPlatforms,
  uniqueAccountStatuses,
} from '@/lib/filterAccountGroups';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { PermissionLockedButton } from '@/components/ui/PermissionLockedButton';
import { cn } from '@/lib/utils';
import type { AccountConnectionStatus, AccountViewMode } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export type { AccountViewMode };

interface AccountSlicerHeaderProps {
  viewMode: AccountViewMode;
  onViewModeChange: (mode: AccountViewMode) => void;
  onQuickAddBrand?: () => void;
}

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}

function SlicerSelect({ value, onChange, options, className }: FilterSelectProps) {
  return (
    <DarkSelect
      value={value}
      onChange={onChange}
      options={options}
      className={className}
      triggerClassName="account-slicer-select"
    />
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

export function AccountSlicerHeader({
  viewMode,
  onViewModeChange,
  onQuickAddBrand,
}: AccountSlicerHeaderProps) {
  const { t } = useLanguage();
  const { canManageStructure } = usePermissions();
  const { groups, filteredGroups, accountFilters, setAccountFilters } = useGroupMonitoring();

  const exportableAccountCount = useMemo(
    () => filteredGroups.reduce((n, group) => n + group.accounts.length, 0),
    [filteredGroups],
  );

  function handleExportFiltered() {
    if (exportableAccountCount === 0) return;
    exportAllAccountsExcel(filteredGroups);
  }

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
        <form
          className="account-slicer-search-group"
          onSubmit={(event) => event.preventDefault()}
        >
          <input
            type="search"
            value={accountFilters.search}
            onChange={(e) => patchFilters({ search: e.target.value })}
            placeholder={t('groupMonitoring.searchAccPlaceholder')}
            className="account-slicer-search"
            aria-label={t('groupMonitoring.searchAccPlaceholder')}
          />
          <button
            type="submit"
            className="account-slicer-search-btn account-slicer-search-btn--enter"
            aria-label={t('groupMonitoring.searchEnter')}
          >
            {t('groupMonitoring.searchEnter')}
          </button>
        </form>
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

        <button
          type="button"
          className="account-slicer-export-btn"
          disabled={exportableAccountCount === 0}
          onClick={handleExportFiltered}
          title={t('groupMonitoring.exportFiltered')}
          aria-label={t('groupMonitoring.exportFiltered')}
        >
          <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>

        {canManageStructure ? (
          <button
            type="button"
            className="account-slicer-export-btn"
            onClick={() => onQuickAddBrand?.()}
            title={t('groupMonitoring.accountCard.addBrandTitle')}
            aria-label={t('groupMonitoring.accountCard.addBrandTitle')}
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <PermissionLockedButton
            className="account-slicer-export-btn"
            title={t('groupMonitoring.accountCard.addBrandTitle')}
          />
        )}
      </div>
    </div>
  );
}
