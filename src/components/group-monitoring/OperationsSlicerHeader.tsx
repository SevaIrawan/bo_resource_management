import { useMemo } from 'react';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { useLanguage } from '@/hooks/useLanguage';
import { OPERATIONS_PLATFORM_OPTIONS } from '@/lib/operationsPlatformFilter';
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
  platform: Platform;
  onPlatformChange: (platform: Platform) => void;
}

/** Slicer Operations — Platform saja. */
export function OperationsSlicerHeader({
  platform,
  onPlatformChange,
}: OperationsSlicerHeaderProps) {
  const { t } = useLanguage();

  const platformOptions = useMemo(
    () =>
      OPERATIONS_PLATFORM_OPTIONS.map((value) => ({
        value,
        label: platformLabel(t, value),
      })),
    [t],
  );

  return (
    <div className="account-slicer-row operations-slicer-row">
      <div className="account-slicer-left">
        <div className="account-slicer-filters">
          <SlicerSelect
            value={platform}
            onChange={(value) => onPlatformChange(value as Platform)}
            options={platformOptions}
          />
        </div>
      </div>
    </div>
  );
}
