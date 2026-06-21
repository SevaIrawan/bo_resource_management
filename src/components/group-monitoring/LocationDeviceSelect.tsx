import { useMemo } from 'react';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { LOCATION_DEVICE_OPTIONS, normalizeLocationDeviceOption } from '@/config/locationDeviceOptions';
import { useLanguage } from '@/hooks/useLanguage';

interface LocationDeviceSelectProps {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function LocationDeviceSelect({
  id,
  value,
  disabled = false,
  onChange,
}: LocationDeviceSelectProps) {
  const { t } = useLanguage();
  const selected = normalizeLocationDeviceOption(value) || '';

  const options = useMemo(
    () => [
      {
        value: '',
        label: t('groupMonitoring.accountCard.locationDeviceSelectPlaceholder'),
      },
      ...LOCATION_DEVICE_OPTIONS.map((code) => ({
        value: code,
        label: code,
      })),
    ],
    [t],
  );

  return (
    <DarkSelect
      id={id}
      value={selected}
      onChange={onChange}
      options={options}
      disabled={disabled}
      ariaLabel={t('groupMonitoring.accountCard.locationDeviceLabel')}
      className="brand-modal-select-wrap"
      triggerClassName="brand-modal-select-trigger"
    />
  );
}
