import { Search } from 'lucide-react';
import { useMemo } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { reportingAccountDisplayName } from '@/lib/reportingDisplayName';
import type { ReportingStockStatusFilter } from '@/lib/filterReportingStockStatus';
import { cn } from '@/lib/utils';
import type { GroupStockBucket } from '@/types/groupStock';
import { GROUP_STOCK_BUCKETS } from '@/types/groupStock';
import type { Platform } from '@/types/database';
import type { AccountBrandGroup } from '@/types/accountMonitoringUi';

export type ReportingBookmark = 'full_group' | 'full_admin';

export type { ReportingStockStatusFilter };

export type ReportingFilters = {
  brandName: string;
  platform: Platform;
  accountId: string;
  stockStatus: ReportingStockStatusFilter;
  bookmark: ReportingBookmark;
  groupNameSearch: string;
};

export const REPORTING_ACCOUNT_ALL = 'all';

interface ReportingSlicerHeaderProps {
  groups: AccountBrandGroup[];
  filters: ReportingFilters;
  onChange: (patch: Partial<ReportingFilters>) => void;
}

function platformLabel(t: (key: string) => string, platform: Platform): string {
  return platform === 'whatsapp'
    ? t('groupMonitoring.platform.whatsapp')
    : t('groupMonitoring.platform.telegram');
}

function ReportingSlicerField({
  label,
  value,
  onChange,
  options,
  menuAlign = 'left',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  menuAlign?: 'left' | 'right';
}) {
  return (
    <div className="reporting-slicer-field">
      <span className="reporting-slicer-label">{label}</span>
      <DarkSelect
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={label}
        menuAlign={menuAlign}
        className="reporting-slicer-select-wrap"
        triggerClassName="account-slicer-select"
      />
    </div>
  );
}

function uniquePlatforms(groups: AccountBrandGroup[]): Platform[] {
  return [...new Set(groups.flatMap((g) => g.accounts.map((a) => a.platform)))] as Platform[];
}

function brandsForPlatform(groups: AccountBrandGroup[], platform: Platform): string[] {
  return [
    ...new Set(
      groups.filter((g) => g.accounts.some((a) => a.platform === platform)).map((g) => g.brandName),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function ReportingSlicerHeader({
  groups,
  filters,
  onChange,
}: ReportingSlicerHeaderProps) {
  const { t } = useLanguage();

  const platformOptions = useMemo(() => {
    return uniquePlatforms(groups).map((p) => ({
      value: p,
      label: platformLabel(t, p),
    }));
  }, [groups, t]);

  const brandOptions = useMemo(() => {
    return brandsForPlatform(groups, filters.platform).map((name) => ({
      value: name,
      label: name,
    }));
  }, [groups, filters.platform]);

  const brandGroup = useMemo(
    () => groups.find((g) => g.brandName === filters.brandName),
    [groups, filters.brandName],
  );

  const accountOptions = useMemo(() => {
    const accounts = (brandGroup?.accounts ?? []).filter((a) => a.platform === filters.platform);
    const sorted = [...accounts].sort((a, b) => a.accountName.localeCompare(b.accountName));
    return [
      { value: REPORTING_ACCOUNT_ALL, label: t('groupMonitoring.reporting.all') },
      ...sorted.map((a) => ({
        value: a.id,
        label: reportingAccountDisplayName(a.accountName, filters.brandName),
      })),
    ];
  }, [brandGroup, filters.brandName, filters.platform, t]);

  const statusOptions = useMemo(() => {
    return [
      { value: 'all', label: t('groupMonitoring.reporting.statusAll') },
      ...GROUP_STOCK_BUCKETS.map((bucket) => ({
        value: bucket,
        label: t(`operations.stock.${bucket}`),
      })),
    ];
  }, [t]);

  const bookmarks: ReportingBookmark[] = ['full_group', 'full_admin'];

  return (
    <div className="account-slicer-row reporting-slicer-row">
      <div className="account-slicer-left">
        <div className="account-slicer-search-group">
          <input
            type="search"
            value={filters.groupNameSearch}
            onChange={(e) => onChange({ groupNameSearch: e.target.value })}
            placeholder={t('groupMonitoring.reporting.searchGroupNamePlaceholder')}
            className="account-slicer-search"
            aria-label={t('groupMonitoring.reporting.searchGroupNamePlaceholder')}
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

      <div className="account-slicer-right reporting-slicer-right">
        <div className="reporting-slicer-filters">
          <ReportingSlicerField
            label={t('groupMonitoring.reporting.platformLabel')}
            value={filters.platform}
            onChange={(v) =>
              onChange({ platform: v as Platform, accountId: REPORTING_ACCOUNT_ALL })
            }
            options={platformOptions}
          />
          <ReportingSlicerField
            label={t('groupMonitoring.reporting.brandLabel')}
            value={filters.brandName}
            onChange={(brandName) => onChange({ brandName })}
            options={brandOptions}
          />
          <ReportingSlicerField
            label={t('groupMonitoring.reporting.accNameLabel')}
            value={filters.accountId}
            onChange={(accountId) => onChange({ accountId })}
            options={accountOptions}
            menuAlign="right"
          />
          <ReportingSlicerField
            label={t('groupMonitoring.reporting.statusLabel')}
            value={filters.stockStatus}
            onChange={(stockStatus) =>
              onChange({ stockStatus: stockStatus as ReportingStockStatusFilter })
            }
            options={statusOptions}
            menuAlign="right"
          />
        </div>

        <div
          className="account-slicer-view-toggle"
          role="group"
          aria-label={t('groupMonitoring.reporting.bookmarksLabel')}
        >
          {bookmarks.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ bookmark: mode })}
              className={cn(
                'account-slicer-view-btn',
                filters.bookmark === mode && 'account-slicer-view-btn--active',
              )}
            >
              {mode === 'full_group'
                ? t('groupMonitoring.reporting.bookmarkFullGroup')
                : t('groupMonitoring.reporting.bookmarkFullAdmin')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function defaultReportingFilters(groups: AccountBrandGroup[]): ReportingFilters {
  const platform = uniquePlatforms(groups)[0] ?? ('whatsapp' satisfies Platform);
  const brandName = brandsForPlatform(groups, platform)[0] ?? groups[0]?.brandName ?? '';
  return {
    brandName,
    platform,
    accountId: REPORTING_ACCOUNT_ALL,
    stockStatus: 'all',
    bookmark: 'full_group',
    groupNameSearch: '',
  };
}

export function normalizeReportingFilters(
  groups: AccountBrandGroup[],
  current: ReportingFilters,
): ReportingFilters {
  if (groups.length === 0) return current;

  const platforms = uniquePlatforms(groups);
  const platform = platforms.includes(current.platform) ? current.platform : (platforms[0] ?? 'whatsapp');

  const brandNames = brandsForPlatform(groups, platform);
  const brandName = brandNames.includes(current.brandName)
    ? current.brandName
    : (brandNames[0] ?? current.brandName);

  const brandGroup = groups.find((g) => g.brandName === brandName);
  const accountIds = (brandGroup?.accounts ?? [])
    .filter((a) => a.platform === platform)
    .map((a) => a.id);
  const accountId =
    current.accountId === REPORTING_ACCOUNT_ALL || accountIds.includes(current.accountId)
      ? current.accountId
      : REPORTING_ACCOUNT_ALL;

  const bookmark = current.bookmark === 'full_admin' ? 'full_admin' : 'full_group';
  const stockStatus =
    current.stockStatus === 'all' ||
    GROUP_STOCK_BUCKETS.includes(current.stockStatus as GroupStockBucket)
      ? current.stockStatus
      : 'all';

  return {
    brandName,
    platform,
    accountId,
    stockStatus,
    bookmark,
    groupNameSearch: current.groupNameSearch ?? '',
  };
}
