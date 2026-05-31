import { ChevronDown, Search } from 'lucide-react';
import { useMemo } from 'react';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';
import { uniqueTicketBrands, uniqueTicketPlatforms } from '@/lib/filterTicketSummaries';
import type { TicketType } from '@/types/ticketMonitoringUi';

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function SlicerSelect({ value, onChange, options }: FilterSelectProps) {
  return (
    <div className="account-slicer-select-wrap">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="account-slicer-select"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="account-slicer-select-icon" aria-hidden />
    </div>
  );
}

const TICKET_TYPE_OPTIONS: TicketType[] = [
  'missing_group',
  'not_admin',
  'group_count_mismatch',
  'duplicate_group_id',
  'duplicate_group_name',
  'daily_junk_group',
];

export function TicketSlicerHeader() {
  const { t } = useLanguage();
  const { ticketSummaries, ticketFilters, setTicketFilters } = useGroupMonitoring();

  const patchFilters = (partial: Partial<typeof ticketFilters>) => {
    setTicketFilters((prev) => ({ ...prev, ...partial }));
  };

  const brandOptions = useMemo(() => {
    const brands = uniqueTicketBrands(ticketSummaries);
    return [
      { value: 'all', label: t('groupMonitoring.ticketPanel.filters.allBrands') },
      ...brands.map((name) => ({ value: name, label: name })),
    ];
  }, [ticketSummaries, t]);

  const typeOptions = useMemo(
    () => [
      { value: 'all', label: t('groupMonitoring.ticketPanel.filters.allTypes') },
      ...TICKET_TYPE_OPTIONS.map((value) => ({
        value,
        label: t(`groupMonitoring.ticketPanel.types.${ticketTypeI18nKey(value)}`),
      })),
    ],
    [t],
  );

  const platformOptions = useMemo(() => {
    const platforms = uniqueTicketPlatforms(ticketSummaries);
    return [
      { value: 'all', label: t('groupMonitoring.filters.allPlatforms') },
      ...platforms.map((value) => ({
        value,
        label:
          value === 'whatsapp'
            ? t('groupMonitoring.platform.whatsapp')
            : t('groupMonitoring.platform.telegram'),
      })),
    ];
  }, [ticketSummaries, t]);

  return (
    <div className="account-slicer-row">
      <div className="account-slicer-left">
        <div className="account-slicer-search-group">
          <input
            type="search"
            value={ticketFilters.search}
            onChange={(event) => patchFilters({ search: event.target.value })}
            placeholder={t('groupMonitoring.ticketPanel.searchPlaceholder')}
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
            value={ticketFilters.brand}
            onChange={(brand) => patchFilters({ brand })}
            options={brandOptions}
          />
          <SlicerSelect
            value={ticketFilters.platform}
            onChange={(platform) => patchFilters({ platform })}
            options={platformOptions}
          />
          <SlicerSelect
            value={ticketFilters.ticketType}
            onChange={(ticketType) => patchFilters({ ticketType })}
            options={typeOptions}
          />
        </div>
      </div>
    </div>
  );
}

function ticketTypeI18nKey(type: TicketType): string {
  const map: Record<TicketType, string> = {
    missing_group: 'missingGroup',
    not_admin: 'notAdmin',
    group_count_mismatch: 'countMismatch',
    duplicate_group_id: 'duplicateGroupId',
    duplicate_group_name: 'duplicateGroupName',
    daily_junk_group: 'dailyJunk',
  };
  return map[type];
}
