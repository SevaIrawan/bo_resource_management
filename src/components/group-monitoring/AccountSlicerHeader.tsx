import { Download, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { usePermissions } from '@/hooks/usePermissions';
import { exportAllAccountsExcel } from '@/lib/exportExcel';
import {
  type AccountSlicerFilters,
  uniqueAccountBrands,
  uniqueAccountPlatforms,
} from '@/lib/filterAccountGroups';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { PermissionLockedButton } from '@/components/ui/PermissionLockedButton';
import { cn } from '@/lib/utils';
import type {
  AccountBrandGroup,
  AccountViewMode,
} from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';

export type { AccountViewMode };

/** Account tab — platform wajib WA atau TG (tanpa "All platforms"). */
const ACCOUNT_PLATFORM_OPTIONS: Platform[] = ['whatsapp', 'telegram'];

/** Filter Session akun — value = sessionStatus DB, label = Active/Logout. */
const ACCOUNT_SESSION_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'valid', labelKey: 'groupMonitoring.accountCard.sessionValid' },
  { value: 'invalid', labelKey: 'groupMonitoring.accountCard.sessionInvalid' },
];

/** Filter Status alignment — Aligned / Not Aligned. */
const ACCOUNT_STATUS_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'aligned', labelKey: 'groupMonitoring.accountCard.remarkAligned' },
  { value: 'not_aligned', labelKey: 'groupMonitoring.accountCard.remarkNotAligned' },
];

interface AccountSlicerHeaderProps {
  viewMode: AccountViewMode;
  onViewModeChange: (mode: AccountViewMode) => void;
  onOpenAddBrand?: () => void;
  groups: AccountBrandGroup[];
  filteredGroups: AccountBrandGroup[];
  accountFilters: AccountSlicerFilters;
  setAccountFilters: Dispatch<SetStateAction<AccountSlicerFilters>>;
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

function platformLabel(t: (key: string) => string, platform: Platform): string {
  return platform === 'whatsapp'
    ? t('groupMonitoring.platform.whatsapp')
    : t('groupMonitoring.platform.telegram');
}

export function AccountSlicerHeader({
  viewMode,
  onViewModeChange,
  onOpenAddBrand,
  groups,
  filteredGroups,
  accountFilters,
  setAccountFilters,
}: AccountSlicerHeaderProps) {
  const { t } = useLanguage();
  const { canManageStructure } = usePermissions();

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

  const availablePlatforms = useMemo(() => uniqueAccountPlatforms(groups), [groups]);
  const platformInitDoneRef = useRef(false);

  useEffect(() => {
    if (platformInitDoneRef.current) return;
    if (availablePlatforms.length === 0) return;

    platformInitDoneRef.current = true;
    const hasWhatsApp = availablePlatforms.includes('whatsapp');
    const hasTelegram = availablePlatforms.includes('telegram');

    setAccountFilters((prev) => {
      if (prev.platform === 'whatsapp' || prev.platform === 'telegram') {
        if (prev.platform === 'whatsapp' && !hasWhatsApp && hasTelegram) {
          return { ...prev, platform: 'telegram' };
        }
        return prev;
      }
      if (hasWhatsApp) return { ...prev, platform: 'whatsapp' };
      if (hasTelegram) return { ...prev, platform: 'telegram' };
      return { ...prev, platform: 'whatsapp' };
    });
  }, [availablePlatforms, setAccountFilters]);

  const brandOptions = useMemo(() => {
    const brands = uniqueAccountBrands(groups);
    return [
      { value: 'all', label: t('groupMonitoring.filters.allBrands') },
      ...brands.map((name) => ({ value: name, label: name })),
    ];
  }, [groups, t]);

  const platformOptions = useMemo(
    () =>
      ACCOUNT_PLATFORM_OPTIONS.map((value) => ({
        value,
        label: platformLabel(t, value),
      })),
    [t],
  );

  const sessionOptions = useMemo(
    () => [
      { value: 'all', label: t('groupMonitoring.filters.allSession') },
      ...ACCOUNT_SESSION_OPTIONS.map(({ value, labelKey }) => ({
        value,
        label: t(labelKey),
      })),
    ],
    [t],
  );

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: t('groupMonitoring.filters.allStatus') },
      ...ACCOUNT_STATUS_OPTIONS.map(({ value, labelKey }) => ({
        value,
        label: t(labelKey),
      })),
    ],
    [t],
  );

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
            value={accountFilters.session}
            onChange={(session) => patchFilters({ session })}
            options={sessionOptions}
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
            onClick={() => onOpenAddBrand?.()}
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
