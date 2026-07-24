import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import {
  combineScheduledHourAmPm,
  scheduledHour12Options,
  scheduledHourPeriodOptions,
  splitScheduledHourAmPm,
  type ScheduledHourPeriod,
} from '@/config/autoScrapeSchedule';
import {
  autoScrapeBrandAccountMapsEqual,
  autoScrapeBrandToggleMapsEqual,
  countEnabledAutoScrapeBrandsForPlatform,
  filterAccountsByAutoScrapeSelection,
  getAutoScrapeBrandAccountSelection,
  getAutoScrapeBrandRunStatus,
  getMaxAutoScrapeBrandSlotsPerPlatform,
  isAutoScrapeBrandEnabled,
  normalizeInactiveAutoScrapeAccountsToAll,
  persistAutoScrapeBrandAccounts,
  persistAutoScrapeBrandToggles,
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
import {
  persistAutoScrapeNowEnabled,
  readAutoScrapeNowEnabled,
  requestAutoScrapeNowRun,
} from '@/config/autoScrapeNowSettings';
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
import { cn } from '@/lib/utils';
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
  defaultExpanded?: boolean;
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
    defaultExpanded = false,
    onBrandToggle,
    onAccountsChange,
    onViewStatus,
    t,
  } = props;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const used = countEnabledAutoScrapeBrandsForPlatform(platform, toggles);
  const title = platform === 'whatsapp' ? 'WhatsApp' : 'Telegram';
  const panelId = `auto-scrape-platform-${platform}`;

  return (
    <div
      className="min-w-0 rounded-lg border border-border-subtle bg-bg-shell/40"
      data-dark-select-clip
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-bg-active/30"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-text-muted transition-transform',
              !expanded && '-rotate-90',
            )}
            strokeWidth={2}
            aria-hidden
          />
          <span className="text-xs font-medium text-text-primary">{title}</span>
        </span>
        <span className="shrink-0 text-xs text-text-muted">
          {t('settings.autoSync.brandSlotsUsed', {
            used: String(used),
            max: String(maxSlots),
          })}
        </span>
      </button>

      {expanded ? (
        <div id={panelId} className="auto-scrape-brand-table border-t border-border-subtle px-3 pb-3 pt-2">
          <div className="auto-scrape-brand-table__row auto-scrape-brand-table__head">
            <span>{t('settings.autoSync.colBrand')}</span>
            <span>{t('settings.autoSync.colAcc')}</span>
            <span>{t('settings.autoSync.colTimeScrape')}</span>
            <span>{t('settings.autoSync.colStatus')}</span>
          </div>

          {brands.length === 0 ? (
            <p className="mt-2 text-xs text-text-muted">{t('settings.autoSync.noBrands')}</p>
          ) : (
            <ul className="auto-scrape-brand-table__body">
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
                  <li key={`${platform}:${brand.id}`} className="auto-scrape-brand-table__row">
                    <label className="auto-scrape-brand-table__brand">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-border-subtle"
                        checked={on}
                        disabled={!enabled}
                        onChange={(e) => onBrandToggle(platform, brand.name, e.target.checked)}
                      />
                      <span className="auto-scrape-brand-table__brand-name">{brand.name}</span>
                    </label>

                    <DarkMultiSelect
                      values={on ? values : []}
                      onChange={(next) => onAccountsChange(platform, brand.name, next)}
                      options={options}
                      disabled={!on || !enabled || options.length === 0}
                      showSelectAll
                      selectAllLabel={t('settings.autoSync.accAll')}
                      placeholder={t('settings.autoSync.accAll')}
                      closeOnSelect={false}
                      menuPlacement="auto"
                      ariaLabel={`${brand.name} accounts`}
                      triggerClassName="!min-h-8 !py-1 !text-xs"
                      summaryLabel={(count) =>
                        count >= options.length && options.length > 0
                          ? t('settings.autoSync.accAll')
                          : t('settings.autoSync.accSelected', { count: String(count) })
                      }
                    />

                    <span className="auto-scrape-brand-table__cell text-text-muted">
                      {on && timeIso ? formatLastSyncAt(timeIso, dateLocale) : '-'}
                    </span>

                    {!on || !runStatus ? (
                      <span className="auto-scrape-brand-table__cell text-text-muted/50">
                        {t('settings.autoSync.statusStandby')}
                      </span>
                    ) : runStatus.allSuccessful ? (
                      <span className="auto-scrape-brand-table__cell truncate text-emerald-400">
                        {t('settings.autoSync.statusSuccessful')}
                      </span>
                    ) : (
                      <span className="auto-scrape-brand-table__cell gap-1 text-amber-400">
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
      ) : null}
    </div>
  );
}

export function AutoSyncSettingsSection() {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const {
    enabled: savedEnabled,
    setEnabled,
    scheduledHour: savedScheduledHour,
    setScheduledHour,
  } = useAutoSyncSettings();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [accounts, setAccounts] = useState<AccountOptionRow[]>([]);
  const [lastSyncByAccountId, setLastSyncByAccountId] = useState<LastSyncByAccountId>({});

  const [savedToggles, setSavedToggles] = useState<AutoScrapeBrandToggleMap>(
    readAutoScrapeBrandToggles,
  );
  const [savedAccountMap, setSavedAccountMap] = useState<AutoScrapeBrandAccountMap>(() =>
    normalizeInactiveAutoScrapeAccountsToAll(
      readAutoScrapeBrandToggles(),
      readAutoScrapeBrandAccounts(),
    ),
  );
  const [draftEnabled, setDraftEnabled] = useState(savedEnabled);
  const [draftScheduledHour, setDraftScheduledHour] = useState(savedScheduledHour);
  const [savedScrapeNow, setSavedScrapeNow] = useState(readAutoScrapeNowEnabled);
  const [draftScrapeNow, setDraftScrapeNow] = useState(savedScrapeNow);
  const [draftToggles, setDraftToggles] = useState<AutoScrapeBrandToggleMap>(savedToggles);
  const [draftAccountMap, setDraftAccountMap] =
    useState<AutoScrapeBrandAccountMap>(savedAccountMap);

  const [statusMap, setStatusMap] = useState<AutoScrapeBrandStatusMap>(
    readAutoScrapeBrandStatus,
  );
  const [slotFullHint, setSlotFullHint] = useState<string | null>(null);
  const [statusDetail, setStatusDetail] = useState<StatusDetailModalState | null>(null);
  const [executeMessage, setExecuteMessage] = useState<string | null>(null);
  const maxSlots = getMaxAutoScrapeBrandSlotsPerPlatform();
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-GB';

  const dirty = useMemo(
    () =>
      draftEnabled !== savedEnabled ||
      draftScheduledHour !== savedScheduledHour ||
      draftScrapeNow !== savedScrapeNow ||
      !autoScrapeBrandToggleMapsEqual(draftToggles, savedToggles) ||
      !autoScrapeBrandAccountMapsEqual(draftAccountMap, savedAccountMap),
    [
      draftAccountMap,
      draftEnabled,
      draftScheduledHour,
      draftScrapeNow,
      draftToggles,
      savedAccountMap,
      savedEnabled,
      savedScheduledHour,
      savedScrapeNow,
      savedToggles,
    ],
  );

  const brandSetupEnabled = draftEnabled || draftScrapeNow;

  const reloadSavedBrandSettings = useCallback((opts?: { syncDraft?: boolean }) => {
    const nextToggles = readAutoScrapeBrandToggles();
    const nextAccounts = normalizeInactiveAutoScrapeAccountsToAll(
      nextToggles,
      readAutoScrapeBrandAccounts(),
    );
    setSavedToggles(nextToggles);
    setSavedAccountMap(nextAccounts);
    if (opts?.syncDraft) {
      setDraftToggles(nextToggles);
      setDraftAccountMap(nextAccounts);
    }
    setStatusMap(readAutoScrapeBrandStatus());
  }, []);

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
    if (dirty) return;
    setDraftEnabled(savedEnabled);
    setDraftScheduledHour(savedScheduledHour);
    setDraftScrapeNow(savedScrapeNow);
  }, [dirty, savedEnabled, savedScheduledHour, savedScrapeNow]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.includes('rm_auto_scrape')) {
        reloadSavedBrandSettings({ syncDraft: !dirty });
        const nextScrapeNow = readAutoScrapeNowEnabled();
        setSavedScrapeNow(nextScrapeNow);
        if (!dirty) setDraftScrapeNow(nextScrapeNow);
      }
    };
    const onStatus = () => setStatusMap(readAutoScrapeBrandStatus());
    window.addEventListener('storage', onStorage);
    window.addEventListener('rm-auto-scrape-brand-status', onStatus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('rm-auto-scrape-brand-status', onStatus);
    };
  }, [dirty, reloadSavedBrandSettings]);

  const onBrandToggle = useCallback(
    (platform: Platform, brandName: string, nextEnabled: boolean) => {
      setExecuteMessage(null);
      const result = setAutoScrapeBrandEnabled(
        platform,
        brandName,
        nextEnabled,
        draftToggles,
        draftAccountMap,
        { persist: false },
      );
      setDraftToggles(result.map);
      setDraftAccountMap(result.accountMap);
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
    [draftAccountMap, draftToggles, maxSlots, t],
  );

  const onAccountsChange = useCallback(
    (platform: Platform, brandName: string, accountIds: string[]) => {
      setExecuteMessage(null);
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
      setDraftAccountMap(
        setAutoScrapeBrandAccounts(platform, brandName, selection, draftAccountMap, {
          persist: false,
        }),
      );
    },
    [accounts, brands, draftAccountMap],
  );

  const handleCancel = useCallback(() => {
    setDraftEnabled(savedEnabled);
    setDraftScheduledHour(savedScheduledHour);
    setDraftScrapeNow(savedScrapeNow);
    setDraftToggles(savedToggles);
    setDraftAccountMap(savedAccountMap);
    setSlotFullHint(null);
    setExecuteMessage(null);
  }, [savedAccountMap, savedEnabled, savedScheduledHour, savedScrapeNow, savedToggles]);

  const handleExecute = useCallback(() => {
    if (dirty) {
      const nextAccounts = normalizeInactiveAutoScrapeAccountsToAll(
        draftToggles,
        draftAccountMap,
        { persist: false },
      );
      setEnabled(draftEnabled);
      setScheduledHour(draftScheduledHour);
      persistAutoScrapeNowEnabled(draftScrapeNow);
      persistAutoScrapeBrandToggles(draftToggles);
      persistAutoScrapeBrandAccounts(nextAccounts);
      setSavedToggles(draftToggles);
      setSavedAccountMap(nextAccounts);
      setDraftAccountMap(nextAccounts);
      setSavedScrapeNow(draftScrapeNow);
    }
    setSlotFullHint(null);
    if (draftScrapeNow) {
      requestAutoScrapeNowRun();
      setExecuteMessage(t('settings.autoSync.executedScrapeNow'));
      return;
    }
    setExecuteMessage(t('settings.autoSync.executed'));
  }, [
    dirty,
    draftAccountMap,
    draftEnabled,
    draftScheduledHour,
    draftScrapeNow,
    draftToggles,
    setEnabled,
    setScheduledHour,
    t,
  ]);

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

  const scheduledParts = splitScheduledHourAmPm(draftScheduledHour);

  const platformTables = useMemo(
    () =>
      PLATFORMS.map((platform) => (
        <PlatformBrandTable
          key={platform}
          platform={platform}
          brands={brands}
          accounts={accounts}
          lastSyncByAccountId={lastSyncByAccountId}
          enabled={brandSetupEnabled}
          toggles={draftToggles}
          accountMap={draftAccountMap}
          statusMap={statusMap}
          maxSlots={maxSlots}
          dateLocale={dateLocale}
          defaultExpanded={false}
          onBrandToggle={onBrandToggle}
          onAccountsChange={onAccountsChange}
          onViewStatus={onViewStatus}
          t={t}
        />
      )),
    [
      accounts,
      brandSetupEnabled,
      brands,
      dateLocale,
      draftAccountMap,
      draftToggles,
      lastSyncByAccountId,
      maxSlots,
      onAccountsChange,
      onBrandToggle,
      onViewStatus,
      statusMap,
      t,
    ],
  );

  return (
    <div className="space-y-4">
      <div className="auto-scrape-mode-row">
        <div className="auto-scrape-mode-card">
          <div className="auto-scrape-mode-card__header">
            <h3 className="auto-scrape-mode-card__title">
              {t('settings.autoSync.onScheduledTitle')}
            </h3>
            <button
              type="button"
              role="switch"
              aria-checked={draftEnabled}
              aria-label={t('settings.autoSync.onScheduledTitle')}
              className={cn(
                'operations-job-queue-switch',
                draftEnabled && 'operations-job-queue-switch--on',
              )}
              onClick={() => {
                setExecuteMessage(null);
                setDraftEnabled(!draftEnabled);
              }}
            >
              <span className="operations-job-queue-switch__thumb" aria-hidden />
            </button>
          </div>
          <div className="auto-scrape-mode-card__body">
            <span className="text-xs text-text-muted shrink-0">
              {t('settings.autoSync.scheduledHourLabel')}
            </span>
            <div
              className="auto-scrape-schedule-time"
              role="group"
              aria-label={t('settings.autoSync.scheduledHourLabel')}
            >
              <DarkSelect
                id="auto-scrape-scheduled-hour"
                value={String(scheduledParts.hour12)}
                onChange={(value) => {
                  setExecuteMessage(null);
                  setDraftScheduledHour(
                    combineScheduledHourAmPm(Number(value), scheduledParts.period),
                  );
                }}
                options={scheduledHour12Options()}
                disabled={!draftEnabled}
                menuPlacement="auto"
                menuMaxRows={6}
                ariaLabel={t('settings.autoSync.scheduledHourLabel')}
                className="auto-scrape-schedule-time__hour"
              />
              <DarkSelect
                id="auto-scrape-scheduled-period"
                value={scheduledParts.period}
                onChange={(value) => {
                  setExecuteMessage(null);
                  setDraftScheduledHour(
                    combineScheduledHourAmPm(
                      scheduledParts.hour12,
                      value as ScheduledHourPeriod,
                    ),
                  );
                }}
                options={scheduledHourPeriodOptions()}
                disabled={!draftEnabled}
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

        <div className="auto-scrape-mode-card">
          <div className="auto-scrape-mode-card__header">
            <h3 className="auto-scrape-mode-card__title">
              {t('settings.autoSync.scrapeNowTitle')}
            </h3>
            <button
              type="button"
              role="switch"
              aria-checked={draftScrapeNow}
              aria-label={t('settings.autoSync.scrapeNowTitle')}
              className={cn(
                'operations-job-queue-switch',
                draftScrapeNow && 'operations-job-queue-switch--on',
              )}
              onClick={() => {
                setExecuteMessage(null);
                setDraftScrapeNow(!draftScrapeNow);
              }}
            >
              <span className="operations-job-queue-switch__thumb" aria-hidden />
            </button>
          </div>
          <div className="auto-scrape-mode-card__body">
            <p className="auto-scrape-mode-card__hint">{t('settings.autoSync.scrapeNowHint')}</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-text-muted">{t('settings.autoSync.desc')}</p>

      <div className="flex w-full flex-col gap-3">{platformTables}</div>

      <div className="operations-stock-policy-footer">
        {executeMessage ? (
          <p className="operations-stock-policy-footer__status" role="status">
            {executeMessage}
          </p>
        ) : null}
        <div className="operations-stock-policy-actions">
          <button
            type="button"
            className="operations-stock-policy-discard-btn"
            onClick={handleCancel}
            disabled={!dirty}
          >
            {t('settings.autoSync.discard')}
          </button>
          <button
            type="button"
            className="operations-stock-policy-save-btn"
            onClick={handleExecute}
            disabled={!dirty && !draftScrapeNow}
          >
            {t('settings.autoSync.execute')}
          </button>
        </div>
      </div>

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
