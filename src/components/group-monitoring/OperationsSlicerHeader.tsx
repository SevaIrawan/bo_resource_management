import { useMemo } from 'react';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { useLanguage } from '@/hooks/useLanguage';
import { uniqueAccountBrands } from '@/lib/filterAccountGroups';
import type { OperationsSlicerFilters } from '@/lib/operationsFilters';
import {
  OPERATIONS_PLATFORM_OPTIONS,
} from '@/lib/operationsPlatformFilter';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function SlicerSelect({ value, onChange, options }: FilterSelectProps) {
  return (
    <DarkSelect
      value={value}
      onChange={onChange}
      options={options}
      triggerClassName="account-slicer-select"
    />
  );
}

function platformLabel(t: (key: string) => string, platform: Platform): string {
  return platform === 'whatsapp'
    ? t('groupMonitoring.platform.whatsapp')
    : t('groupMonitoring.platform.telegram');
}

interface OperationsSlicerHeaderProps {
  groups: AccountBrandGroup[];
  filters: OperationsSlicerFilters;
  onChange: (patch: Partial<OperationsSlicerFilters>) => void;
}

/** Slicer Operations — brand + platform; state terpisah dari tab Account. */
export function OperationsSlicerHeader({
  groups,
  filters,
  onChange,
}: OperationsSlicerHeaderProps) {
  const { t } = useLanguage();

  const brandOptions = useMemo(() => {
    const brands = uniqueAccountBrands(groups);
    return [
      { value: 'all', label: t('groupMonitoring.filters.allBrands') },
      ...brands.map((name) => ({ value: name, label: name })),
    ];
  }, [groups, t]);

  const platformOptions = useMemo(
    () =>
      OPERATIONS_PLATFORM_OPTIONS.map((value) => ({
        value,
        label: platformLabel(t, value),
      })),
    [t],
  );

  return (
    <div className="account-slicer-row">
      <div className="account-slicer-right">
        <div className="account-slicer-filters">
          <SlicerSelect
            value={filters.brand}
            onChange={(brand) => onChange({ brand })}
            options={brandOptions}
          />
          <SlicerSelect
            value={filters.platform}
            onChange={(platform) => onChange({ platform: platform as Platform })}
            options={platformOptions}
          />
        </div>
      </div>
    </div>
  );
}
