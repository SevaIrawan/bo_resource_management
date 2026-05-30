import { ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '@/hooks/useLanguage';

const FILTER_DEFAULT = {
  brand: 'all',
  ticketType: 'all',
  search: '',
};

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

export function TicketSlicerHeader() {
  const { t } = useLanguage();
  const [filters, setFilters] = useState(FILTER_DEFAULT);

  const patchFilters = (partial: Partial<typeof FILTER_DEFAULT>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const brandOptions = [
    { value: 'all', label: t('groupMonitoring.ticketPanel.filters.allBrands') },
  ];

  const typeOptions = [
    { value: 'all', label: t('groupMonitoring.ticketPanel.filters.allTypes') },
    { value: 'missing_group', label: t('groupMonitoring.ticketPanel.types.missingGroup') },
    { value: 'not_admin', label: t('groupMonitoring.ticketPanel.types.notAdmin') },
  ];

  return (
    <div className="account-slicer-row">
      <div className="account-slicer-left">
        <div className="account-slicer-search-group">
          <input
            type="search"
            value={filters.search}
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
            value={filters.brand}
            onChange={(brand) => patchFilters({ brand })}
            options={brandOptions}
          />
          <SlicerSelect
            value={filters.ticketType}
            onChange={(ticketType) => patchFilters({ ticketType })}
            options={typeOptions}
          />
        </div>
      </div>
    </div>
  );
}
