import { Download, Search } from 'lucide-react';
import { useMemo } from 'react';
import { useGroupMonitoring } from '@/hooks/useGroupMonitoring';
import { useLanguage } from '@/hooks/useLanguage';
import { exportAllTicketGroupsExcel } from '@/lib/exportExcel';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { uniqueTicketBrands, uniqueTicketPlatforms } from '@/lib/filterTicketSummaries';
import { ticketNoteForDisplay } from '@/lib/ticketNote';
import { ticketTypeLabel } from '@/lib/ticketTypeLabel';
import type { TicketWorkflowBookmark } from '@/lib/ticketWorkflowLocal';
import { cn } from '@/lib/utils';
import type { TicketType } from '@/types/ticketMonitoringUi';

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

const TICKET_TYPE_OPTIONS: TicketType[] = [
  'missing_group',
  'daily_junk_group',
  'not_admin',
  'duplicate_group_id',
  'duplicate_group_name',
];

export function TicketSlicerHeader() {
  const { t } = useLanguage();
  const { ticketSummaries, ticketFilters, setTicketFilters, filteredTicketSummaries } =
    useGroupMonitoring();

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

  const workflowBookmark = ticketFilters.workflowBookmark;

  const workflowModes: TicketWorkflowBookmark[] = ['in_progress', 'completed'];

  const handleExportFiltered = () => {
    exportAllTicketGroupsExcel(
      filteredTicketSummaries,
      (group) => ticketTypeLabel(t, group.ticketType, 'export'),
      (group, line) =>
        ticketNoteForDisplay(t, group.ticketType, line.description, line),
    );
  };

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

        <div
          className="account-slicer-view-toggle"
          role="group"
          aria-label={t('groupMonitoring.ticketPanel.bookmarksLabel')}
        >
          {workflowModes.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => patchFilters({ workflowBookmark: mode })}
              className={cn(
                'account-slicer-view-btn',
                workflowBookmark === mode && 'account-slicer-view-btn--active',
              )}
            >
              {mode === 'in_progress'
                ? t('groupMonitoring.ticketPanel.bookmarkInProgress')
                : t('groupMonitoring.ticketPanel.bookmarkCompleted')}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="account-slicer-export-btn"
          disabled={filteredTicketSummaries.length === 0}
          onClick={handleExportFiltered}
          title={t('groupMonitoring.ticketPanel.exportAll')}
          aria-label={t('groupMonitoring.ticketPanel.exportAll')}
        >
          <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function ticketTypeI18nKey(type: TicketType): string {
  const map: Record<TicketType, string> = {
    missing_group: 'missingGroup',
    not_admin: 'notAdmin',
    duplicate_group_id: 'duplicateGroupId',
    duplicate_group_name: 'duplicateGroupName',
    daily_junk_group: 'dailyJunk',
  };
  return map[type];
}
