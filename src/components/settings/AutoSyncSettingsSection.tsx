import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  combineScheduledHourAmPm,
  scheduledHour12Options,
  scheduledHourPeriodOptions,
  splitScheduledHourAmPm,
  type ScheduledHourPeriod,
} from '@/config/autoScrapeSchedule';
import {
  countEnabledAutoScrapeBrandsForPlatform,
  filterAccountsByAutoScrapeSelection,
  getAutoScrapeBrandAccountSelection,
  getAutoScrapeBrandRunStatus,
  getMaxAutoScrapeBrandSlotsPerPlatform,
  isAutoScrapeBrandEnabled,
  readAutoScrapeBrandAccounts,
  readAutoScrapeBrandStatus,
  readAutoScrapeBrandToggles,
  setAutoScrapeBrandAccounts,
  setAutoScrapeBrandEnabled,
  type AutoScrapeAccountOutcome,
  type AutoScrapeBrandAccountMap,
  type AutoScrapeBrandStatusEntry,
  type AutoScrapeBrandStatusMap,
  type AutoScrapeBrandToggleMap,
} from '@/config/autoScrapeBrandSettings';
import { ACCOUNT_SNAPSHOT_SELECT, MESSAGING_ACCOUNT_SELECT } from '@/config/dbColumns';
import { TABLES } from '@/config/tables';
import { SyncAlertModal } from '@/components/group-monitoring/SyncAlertModal';
import { DarkMultiSelect } from '@/components/ui/DarkMultiSelect';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useAutoSyncSettings } from '@/contexts/AutoSyncSettingsContext';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { loadUserBrands } from '@/lib/brands';
import { formatLastSyncAt } from '@/lib/formatLastSync';
import { reportingAccountDisplayName } from '@/lib/reportingDisplayName';
import { getSupabase } from '@/lib/supabase';
import type { Brand, Platform } from '@/types/database';

type StatusDetailModalState = {
  platform: Platform;
  brandName: string;
  entry: AutoScrapeBrandStatusEntry;
};

function outcomeLabel(
  outcome: AutoScrapeAccountOutcome,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (outcome === 'success') return t('settings.autoSync.outcomeSuccess');
  if (outcome === 'failed') return t('settings.autoSync.outcomeFailed');
  return t('settings.autoSync.outcomeSessionInvalid');
}

function outcomeClass(outcome: AutoScrapeAccountOutcome): string {
  if (outcome === 'success') return 'text-emerald-400';
  if (outcome === 'failed') return 'text-rose-400';
  return 'text-amber-400';
}

type AccountOptionRow = {
  id: string;
  label: string;
  platform: Platform;
  brandId: string;
};

type LastSyncByAccountId = Record<string, string | null>;

const PLATFORMS: Platform[] = ['whatsapp', 'telegram'];

const ROW_GRID =
  'grid grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.75fr)] gap-2';

async function loadActiveAccountsForUser(userId: string): Promise<AccountOptionRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLES.messagingAccounts)
    .select(MESSAGING_ACCOUNT_SELECT)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('label', { ascending: true });
  if (error) throw error;
  return ((data as Array<{
    id: string;
    label: string;
    platform: Platform;
    brand_id: string;
  }> | null) ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    platform: row.platform,
    brandId: row.brand_id,
  }));
}

async function loadLastSyncByAccountIds(accountIds: string[]): Promise<LastSyncByAccountId> {
  const supabase = getSupabase();
  if (!supabase || accountIds.length === 0) return {};
  const { data, error } = await supabase
    .from(TABLES.accountSnapshots)
    .select(ACCOUNT_SNAPSHOT_SELECT)
    .in('account_id', accountIds);
  if (error) throw error;
  const out: LastSyncByAccountId = {};
  for (const row of (data as Array<{
    account_id: string;
    last_sync_at?: string | null;
  }> | null) ?? []) {
    out[row.account_id] = row.last_sync_at ?? null;
  }
  return out;
}

function latestSyncIso(
  accountIds: string[],
  lastSyncByAccountId: LastSyncByAccountId,
): string | null {
  let latestMs = -1;
  let latestIso: string | null = null;
  for (const id of accountIds) {
    const iso = lastSyncByAccountId[id];
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    if (ms > latestMs) {
      latestMs = ms;
      latestIso = iso;
    }
  }
  return latestIso;
}

function PlatformBrandTable(props: {
  platform: Platform;
  brands: Brand[];
  accounts: AccountOptionRow[];
  lastSyncByAccountId: LastSyncByAccountId;
  enabled: boolean;
  toggles: AutoScrapeBrandToggleMap;
  accountMap: AutoScrapeBrandAccountMap;
  statusMap: AutoScrapeBrandStatusMap;
  maxSlots: number;
  dateLocale?: string;
  onBrandToggle: (platform: Platform, brandName: string, next: boolean) => void;
  onAccountsChange: (platform: Platform, brandName: string, accountIds: string[]) => void;
  onViewStatus: (platform: Platform, brandName: string, entry: AutoScrapeBrandStatusEntry) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const {
    platform,
    brands,
    accounts,
    lastSyncByAccountId,
    enabled,
    toggles,
    accountMap,
    statusMap,
    maxSlots,
    dateLocale,
    onBrandToggle,
    onAccountsChange,
    onViewStatus,
    t,
  } = props;
  const used = countEnabledAutoScrapeBrandsForPlatform(platform, toggles);
  const title = platform === 'whatsapp' ? 'WhatsApp' : 'Telegram';

  return (
    <div
      className="min-w-0 rounded-lg border border-border-subtle bg-bg-shell/40 p-3"
      data-dark-select-clip
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-primary">{title}</span>
        <span className="text-xs text-text-muted">
          {t('settings.autoSync.brandSlotsUsed', {
            used: String(used),
            max: String(maxSlots),
          })}
        </span>
      </div>

      <div className={`${ROW_GRID} border-b border-border-subtle pb-1.5`}>
        <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">
          {t('settings.autoSync.colBrand')}
        </span>
        <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">
          {t('settings.autoSync.colAcc')}
        </span>
        <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">
          {t('settings.autoSync.colTimeScrape')}
        </span>
        <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">
          {t('settings.autoSync.colStatus')}
        </span>
      </div>

      {brands.length === 0 ? (
        <p className="mt-2 text-xs text-text-muted">{t('settings.autoSync.noBrands')}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {brands.map((brand) => {
            const on = isAutoScrapeBrandEnabled(platform, brand.name, toggles);
            const brandAccounts = accounts.filter(
              (row) => row.brandId === brand.id && row.platform === platform,
            );
            const options = brandAccounts.map((row) => ({
              value: row.id,
              label: reportingAccountDisplayName(row.label, brand.name),
            }));
            const selection = getAutoScrapeBrandAccountSelection(
              platform,
              brand.name,
              accountMap,
            );
            const values =
              selection === 'all' ? options.map((opt) => opt.value) : selection;
            const scopedAccounts = filterAccountsByAutoScrapeSelection(
              brandAccounts,
              selection,
            );
            const timeIso = on
              ? latestSyncIso(
                  scopedAccounts.map((row) => row.id),
                  lastSyncByAccountId,
                )
              : null;
            const runStatus = on
              ? getAutoScrapeBrandRunStatus(platform, brand.name, statusMap)
              : null;

            return (
              <li key={`${platform}:${brand.id}`} className={`${ROW_GRID} items-center`}>
                <label className="flex min-w-0 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-border-subtle"
                    checked={on}
                    disabled={!enabled}
                    onChange={(e) => onBrandToggle(platform, brand.name, e.target.checked)}
                  />
                  <span className="truncate text-xs text-text-secondary">{brand.name}</span>
                </label>

                {on ? (
                  <DarkMultiSelect
                    values={values}
                    onChange={(next) => onAccountsChange(platform, brand.name, next)}
                    options={options}
                    disabled={!enabled || options.length === 0}
                    showSelectAll
                    selectAllLabel={t('settings.autoSync.accAll')}
                    placeholder={t('settings.autoSync.accAll')}
                    closeOnSelect={false}
                    menuPlacement="auto"
                    ariaLabel={`${brand.name} accounts`}
                    className="min-w-0"
                    triggerClassName="!min-h-8 !py-1 !text-xs"
                    summaryLabel={(count) =>
                      count >= options.length && options.length > 0
                        ? t('settings.autoSync.accAll')
                        : t('settings.autoSync.accSelected', { count: String(count) })
                    }
                  />
                ) : (
                  <span className="text-xs text-text-muted/50">—</span>
                )}

                <span className="truncate text-xs text-text-muted">
                  {on ? formatLastSyncAt(timeIso, dateLocale) : '—'}
                </span>

                {!on || !runStatus ? (
                  <span className="text-xs text-text-muted/50">—</span>
                ) : runStatus.allSuccessful ? (
                  <span className="truncate text-xs text-emerald-400">
                    {t('settings.autoSync.statusSuccessful')}
                  </span>
                ) : (
                  <span className="flex min-w-0 items-center gap-1 text-xs text-amber-400">
                    <span className="truncate">
                      {t('settings.autoSync.statusPartial', {
                        success: String(runStatus.successCount),
                        total: String(runStatus.totalCount),
                      })}
                    </span>
                    <span className="text-text-muted">|</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-sky-400 underline-offset-2 hover:underline"
                      onClick={() => onViewStatus(platform, brand.name, runStatus)}
                    >
                      {t('settings.autoSync.statusView')}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AutoSyncSettingsSection() {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { enabled, setEnabled, scheduledHour, setScheduledHour } = useAutoSyncSettings();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [accounts, setAccounts] = useState<AccountOptionRow[]>([]);
  const [lastSyncByAccountId, setLastSyncByAccountId] = useState<LastSyncByAccountId>({});
  const [toggles, setToggles] = useState<AutoScrapeBrandToggleMap>(readAutoScrapeBrandToggles);
  const [accountMap, setAccountMap] = useState<AutoScrapeBrandAccountMap>(
    readAutoScrapeBrandAccounts,
  );
  const [statusMap, setStatusMap] = useState<AutoScrapeBrandStatusMap>(
    readAutoScrapeBrandStatus,
  );
  const [slotFullHint, setSlotFullHint] = useState<string | null>(null);
  const [statusDetail, setStatusDetail] = useState<StatusDetailModalState | null>(null);
  const maxSlots = getMaxAutoScrapeBrandSlotsPerPlatform();
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-GB';

  useEffect(() => {
    if (!user?.id) {
      setBrands([]);
      setAccounts([]);
      setLastSyncByAccountId({});
      return;
    }
    let cancelled = false;
    void Promise.all([loadUserBrands(user.id), loadActiveAccountsForUser(user.id)])
      .then(async ([brandRows, accountRows]) => {
        if (cancelled) return;
        setBrands(brandRows);
        setAccounts(accountRows);
        const syncMap = await loadLastSyncByAccountIds(accountRows.map((row) => row.id));
        if (!cancelled) setLastSyncByAccountId(syncMap);
      })
      .catch(() => {
        if (cancelled) return;
        setBrands([]);
        setAccounts([]);
        setLastSyncByAccountId({});
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const refresh = () => {
      setToggles(readAutoScrapeBrandToggles());
      setAccountMap(readAutoScrapeBrandAccounts());
      setStatusMap(readAutoScrapeBrandStatus());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.includes('rm_auto_scrape')) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('rm-auto-scrape-brand-status', refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('rm-auto-scrape-brand-status', refresh);
    };
  }, []);

  const onBrandToggle = useCallback(
    (platform: Platform, brandName: string, nextEnabled: boolean) => {
      const result = setAutoScrapeBrandEnabled(
        platform,
        brandName,
        nextEnabled,
        toggles,
        accountMap,
      );
      setToggles(result.map);
      setAccountMap(result.accountMap);
      if (!result.ok) {
        setSlotFullHint(
          t('settings.autoSync.brandSlotsFull', {
            max: String(maxSlots),
            platform: platform === 'whatsapp' ? 'WhatsApp' : 'Telegram',
          }),
        );
        return;
      }
      setSlotFullHint(null);
    },
    [accountMap, maxSlots, t, toggles],
  );

  const onAccountsChange = useCallback(
    (platform: Platform, brandName: string, accountIds: string[]) => {
      const brand = brands.find(
        (row) => row.name.trim().toLowerCase() === brandName.trim().toLowerCase(),
      );
      const options = accounts.filter(
        (row) =>
          row.platform === platform &&
          brand != null &&
          row.brandId === brand.id,
      );
      const allIds = options.map((row) => row.id);
      const selection =
        accountIds.length === 0 ||
        (allIds.length > 0 &&
          allIds.every((id) => accountIds.includes(id)) &&
          accountIds.length >= allIds.length)
          ? ('all' as const)
          : accountIds;
      setAccountMap(setAutoScrapeBrandAccounts(platform, brandName, selection, accountMap));
    },
    [accountMap, accounts, brands],
  );

  const onViewStatus = useCallback(
    (platform: Platform, brandName: string, entry: AutoScrapeBrandStatusEntry) => {
      setStatusDetail({ platform, brandName, entry });
    },
    [],
  );

  useEffect(() => {
    if (!statusDetail) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setStatusDetail(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [statusDetail]);

  const scheduledParts = splitScheduledHourAmPm(scheduledHour);

  const platformTables = useMemo(
    () =>
      PLATFORMS.map((platform) => (
        <PlatformBrandTable
          key={platform}
          platform={platform}
          brands={brands}
          accounts={accounts}
          lastSyncByAccountId={lastSyncByAccountId}
          enabled={enabled}
          toggles={toggles}
          accountMap={accountMap}
          statusMap={statusMap}
          maxSlots={maxSlots}
          dateLocale={dateLocale}
          onBrandToggle={onBrandToggle}
          onAccountsChange={onAccountsChange}
          onViewStatus={onViewStatus}
          t={t}
        />
      )),
    [
      accountMap,
      accounts,
      brands,
      dateLocale,
      enabled,
      lastSyncByAccountId,
      maxSlots,
      onAccountsChange,
      onBrandToggle,
      onViewStatus,
      statusMap,
      t,
      toggles,
    ],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border-subtle"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-xs text-text-secondary">{t('settings.autoSync.enabled')}</span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted shrink-0">
            {t('settings.autoSync.scheduledHourLabel')}
          </span>
          <div className="auto-scrape-schedule-time" role="group" aria-label={t('settings.autoSync.scheduledHourLabel')}>
            <DarkSelect
              id="auto-scrape-scheduled-hour"
              value={String(scheduledParts.hour12)}
              onChange={(value) =>
                setScheduledHour(
                  combineScheduledHourAmPm(Number(value), scheduledParts.period),
                )
              }
              options={scheduledHour12Options()}
              disabled={!enabled}
              menuPlacement="auto"
              menuMaxRows={6}
              ariaLabel={t('settings.autoSync.scheduledHourLabel')}
              className="auto-scrape-schedule-time__hour"
            />
            <DarkSelect
              id="auto-scrape-scheduled-period"
              value={scheduledParts.period}
              onChange={(value) =>
                setScheduledHour(
                  combineScheduledHourAmPm(
                    scheduledParts.hour12,
                    value as ScheduledHourPeriod,
                  ),
                )
              }
              options={scheduledHourPeriodOptions()}
              disabled={!enabled}
              menuPlacement="auto"
              menuMaxRows={2}
              ariaLabel={t('settings.autoSync.scheduledPeriodLabel')}
              className="auto-scrape-schedule-time__period"
            />
          </div>
          <span className="text-xs text-text-muted shrink-0">
            {t('settings.autoSync.scheduledHourUnit')}
          </span>
        </div>
      </div>

      <p className="text-xs text-text-muted">{t('settings.autoSync.desc')}</p>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{platformTables}</div>

      <SyncAlertModal
        open={Boolean(slotFullHint)}
        message={slotFullHint ?? ''}
        tone="error"
        onClose={() => setSlotFullHint(null)}
      />

      {statusDetail ? (
        <BrandModalRoot open={Boolean(statusDetail)} onBackdropClick={() => setStatusDetail(null)}>
          <div
            className="brand-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auto-scrape-status-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="brand-modal-header">
              <h2 id="auto-scrape-status-title" className="brand-modal-title">
                {t('settings.autoSync.statusDetailTitle', {
                  brand: statusDetail.brandName,
                  platform:
                    statusDetail.platform === 'whatsapp' ? 'WhatsApp' : 'Telegram',
                })}
              </h2>
              <button
                type="button"
                className="brand-modal-close"
                onClick={() => setStatusDetail(null)}
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </header>
            <div className="brand-modal-form space-y-3">
              <p className="text-xs text-text-muted">{t('settings.autoSync.statusDetailHint')}</p>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                {statusDetail.entry.accounts.map((row) => (
                  <li
                    key={row.accountId}
                    className="flex items-start justify-between gap-3 rounded-md border border-border-subtle px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-text-primary">
                        {reportingAccountDisplayName(
                          row.accountName,
                          statusDetail.brandName,
                        )}
                      </p>
                      {row.error ? (
                        <p className="mt-0.5 truncate text-xs text-text-muted">{row.error}</p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 text-xs font-medium ${outcomeClass(row.outcome)}`}
                    >
                      {outcomeLabel(row.outcome, t)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="brand-modal-actions">
                <button
                  type="button"
                  className="brand-modal-btn brand-modal-btn--primary"
                  onClick={() => setStatusDetail(null)}
                >
                  {t('settings.autoSync.statusDetailClose')}
                </button>
              </div>
            </div>
          </div>
        </BrandModalRoot>
      ) : null}
    </div>
  );
}
