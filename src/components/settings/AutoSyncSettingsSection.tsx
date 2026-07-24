import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  AUTO_SCRAPE_CYCLE_RUNNING_EVENT,
  AUTO_SCRAPE_NOW_CHANGED_EVENT,
  persistAutoScrapeNowEnabled,
  readAutoScrapeCycleMode,
  readAutoScrapeCycleRunning,
  readAutoScrapeNowEnabled,
  requestAutoScrapeNowRun,
  type AutoScrapeCycleMode,
} from '@/config/autoScrapeNowSettings';
import {
  AUTO_SCRAPE_FACTORY_RESET_EVENT,
  buildScrapeNowEmptyBrandToggles,
  countEnabledAutoScrapeBrands,
  getAutoScrapeFactoryDefaults,
  hydrateAutoScrapeSettingsForIdleUi,
  resetAutoScrapeToFactoryDefaults,
} from '@/config/autoScrapeDefaults';
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
  /** Mode Scrape Now: jangan tampilkan status/time hasil run lama (selalu standby / -). */
  hideRunHistory?: boolean;
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
    hideRunHistory = false,
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
                const runStatus =
                  on && !hideRunHistory
                    ? getAutoScrapeBrandRunStatus(platform, brand.name, statusMap)
                    : null;
                // Time Scrape = waktu run auto scrape brand (bukan last_sync akun yang bisa stale).
                // Scrape Now mode: selalu "-" (siap execute, bukan hasil run lama).
                const timeIso =
                  on && !hideRunHistory
                    ? (runStatus?.updatedAt ??
                        latestSyncIso(
                          scopedAccounts.map((row) => row.id),
                          lastSyncByAccountId,
                        ))
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

  // Hydrate sekali di init: idle = Default / hasil Save; Scrape Now nyangkut → Default.
  const [boot] = useState(() => hydrateAutoScrapeSettingsForIdleUi());

  const [savedToggles, setSavedToggles] = useState<AutoScrapeBrandToggleMap>(
    () => boot.toggles,
  );
  const [savedAccountMap, setSavedAccountMap] = useState<AutoScrapeBrandAccountMap>(
    () => boot.accountMap,
  );
  const [draftEnabled, setDraftEnabled] = useState(() => boot.enabled);
  const [draftScheduledHour, setDraftScheduledHour] = useState(() => boot.scheduledHour);
  const [savedScrapeNow, setSavedScrapeNow] = useState(false);
  const [draftScrapeNow, setDraftScrapeNow] = useState(false);
  const [draftToggles, setDraftToggles] = useState<AutoScrapeBrandToggleMap>(
    () => boot.toggles,
  );
  const [draftAccountMap, setDraftAccountMap] = useState<AutoScrapeBrandAccountMap>(
    () => boot.accountMap,
  );

  const [statusMap, setStatusMap] = useState<AutoScrapeBrandStatusMap>(
    readAutoScrapeBrandStatus,
  );
  const [slotFullHint, setSlotFullHint] = useState<string | null>(null);
  const [statusDetail, setStatusDetail] = useState<StatusDetailModalState | null>(null);
  const [executeMessage, setExecuteMessage] = useState<string | null>(null);
  const [cycleRunning, setCycleRunning] = useState(readAutoScrapeCycleRunning);
  const [cycleMode, setCycleMode] = useState<AutoScrapeCycleMode>(readAutoScrapeCycleMode);
  const [executeLocked, setExecuteLocked] = useState(false);
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

  const enabledBrandCount = useMemo(
    () => countEnabledAutoScrapeBrands(draftToggles),
    [draftToggles],
  );

  /** Scheduled cycle sedang jalan → Scrape Now tidak boleh dinyalakan. */
  const scrapeNowToggleBlocked = cycleRunning && cycleMode === 'scheduled';

  // Cancel: hanya saat dirty. Discard (mode Scrape Now): selalu bisa keluar kecuali cycle jalan.
  const secondaryDisabled =
    cycleRunning || executeLocked || (!draftScrapeNow && !dirty);
  // Save/Execute: wajib dirty; Execute Scrape Now juga wajib ≥1 brand.
  const primaryDisabled =
    cycleRunning ||
    executeLocked ||
    !dirty ||
    (draftScrapeNow && enabledBrandCount === 0);

  const brandSetupEnabled = draftEnabled || draftScrapeNow;

  const applyFactoryToUi = useCallback(
    (defaults = getAutoScrapeFactoryDefaults()) => {
      setEnabled(defaults.enabled);
      setScheduledHour(defaults.scheduledHour);
      setDraftEnabled(defaults.enabled);
      setDraftScheduledHour(defaults.scheduledHour);
      setSavedScrapeNow(defaults.scrapeNow);
      setDraftScrapeNow(defaults.scrapeNow);
      setSavedToggles(defaults.toggles);
      setDraftToggles(defaults.toggles);
      setSavedAccountMap(defaults.accountMap);
      setDraftAccountMap(defaults.accountMap);
      setStatusMap(readAutoScrapeBrandStatus());
    },
    [setEnabled, setScheduledHour],
  );

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
    // Sync context + pastikan UI idle = Default / Save (bukan Scrape Now On + 6 brand).
    const next = hydrateAutoScrapeSettingsForIdleUi();
    setEnabled(next.enabled);
    setScheduledHour(next.scheduledHour);
    setDraftEnabled(next.enabled);
    setDraftScheduledHour(next.scheduledHour);
    setSavedScrapeNow(false);
    setDraftScrapeNow(false);
    setSavedToggles(next.toggles);
    setDraftToggles(next.toggles);
    setSavedAccountMap(next.accountMap);
    setDraftAccountMap(next.accountMap);
    setStatusMap(readAutoScrapeBrandStatus());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount hydrate only
  }, []);

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
    const onStatus = () => {
      setStatusMap(readAutoScrapeBrandStatus());
      const ids = accounts.map((row) => row.id);
      if (ids.length === 0) return;
      void loadLastSyncByAccountIds(ids)
        .then((syncMap) => setLastSyncByAccountId(syncMap))
        .catch(() => undefined);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('rm-auto-scrape-brand-status', onStatus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('rm-auto-scrape-brand-status', onStatus);
    };
  }, [accounts, dirty, reloadSavedBrandSettings]);

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

  useEffect(() => {
    const onRunning = (event: Event) => {
      const running =
        event instanceof CustomEvent && typeof event.detail?.running === 'boolean'
          ? event.detail.running
          : readAutoScrapeCycleRunning();
      const modeNext =
        event instanceof CustomEvent && typeof event.detail?.mode === 'string'
          ? (event.detail.mode as AutoScrapeCycleMode)
          : readAutoScrapeCycleMode();
      setCycleRunning(running);
      setCycleMode(modeNext);
      if (!running) setExecuteLocked(false);
    };
    window.addEventListener(AUTO_SCRAPE_CYCLE_RUNNING_EVENT, onRunning);
    return () => window.removeEventListener(AUTO_SCRAPE_CYCLE_RUNNING_EVENT, onRunning);
  }, []);

  useEffect(() => {
    const onScrapeNowChanged = (event: Event) => {
      // Hanya sync flag Scrape Now. Brand/jadwal ikut FACTORY_RESET / handler lokal.
      const enabledNext =
        event instanceof CustomEvent && typeof event.detail?.enabled === 'boolean'
          ? event.detail.enabled
          : readAutoScrapeNowEnabled();
      setSavedScrapeNow(enabledNext);
      setDraftScrapeNow(enabledNext);
    };
    const onFactoryReset = (event: Event) => {
      const defaults =
        event instanceof CustomEvent && event.detail
          ? (event.detail as ReturnType<typeof getAutoScrapeFactoryDefaults>)
          : getAutoScrapeFactoryDefaults();
      applyFactoryToUi(defaults);
      setExecuteLocked(false);
      setSlotFullHint(null);
    };
    window.addEventListener(AUTO_SCRAPE_NOW_CHANGED_EVENT, onScrapeNowChanged);
    window.addEventListener(AUTO_SCRAPE_FACTORY_RESET_EVENT, onFactoryReset);
    return () => {
      window.removeEventListener(AUTO_SCRAPE_NOW_CHANGED_EVENT, onScrapeNowChanged);
      window.removeEventListener(AUTO_SCRAPE_FACTORY_RESET_EVENT, onFactoryReset);
    };
  }, [applyFactoryToUi]);

  const handleCancelOrDiscard = useCallback(() => {
    if (draftScrapeNow) {
      // Discard dari mode Scrape Now → factory defaults + Scrape Now Off.
      const defaults = resetAutoScrapeToFactoryDefaults();
      applyFactoryToUi(defaults);
      setSlotFullHint(null);
      setExecuteMessage(null);
      return;
    }
    setDraftEnabled(savedEnabled);
    setDraftScheduledHour(savedScheduledHour);
    setDraftScrapeNow(savedScrapeNow);
    setDraftToggles(savedToggles);
    setDraftAccountMap(savedAccountMap);
    setSlotFullHint(null);
    setExecuteMessage(null);
  }, [
    applyFactoryToUi,
    draftScrapeNow,
    savedAccountMap,
    savedEnabled,
    savedScheduledHour,
    savedScrapeNow,
    savedToggles,
  ]);

  const handleSaveOrExecute = useCallback(async () => {
    if (executeLocked || cycleRunning) return;
    if (!dirty) return;
    if (draftScrapeNow && enabledBrandCount === 0) return;

    setExecuteLocked(true);
    setExecuteMessage(null);
    try {
      const nextAccounts = normalizeInactiveAutoScrapeAccountsToAll(
        draftToggles,
        draftAccountMap,
        { persist: false },
      );

      if (!draftScrapeNow) {
        // Save — persist jadwal/brand saja, tidak scrape.
        setEnabled(draftEnabled);
        setScheduledHour(draftScheduledHour);
        persistAutoScrapeNowEnabled(false);
        persistAutoScrapeBrandToggles(draftToggles);
        persistAutoScrapeBrandAccounts(nextAccounts);
        setSavedToggles(draftToggles);
        setSavedAccountMap(nextAccounts);
        setDraftAccountMap(nextAccounts);
        setSavedScrapeNow(false);
        setDraftScrapeNow(false);
        setSlotFullHint(null);
        setExecuteMessage(t('settings.autoSync.saved'));
        setExecuteLocked(false);
        return;
      }

      // Execute Scrape Now — wajib On Scheduled On + brand aktif.
      setEnabled(true);
      setDraftEnabled(true);
      setScheduledHour(draftScheduledHour);
      persistAutoScrapeNowEnabled(true);
      persistAutoScrapeBrandToggles(draftToggles);
      persistAutoScrapeBrandAccounts(nextAccounts);
      setSavedToggles(draftToggles);
      setSavedAccountMap(nextAccounts);
      setDraftAccountMap(nextAccounts);
      setSavedScrapeNow(true);
      setSlotFullHint(null);

      const result = await requestAutoScrapeNowRun();
      if (!result.ok && result.reason === 'busy') {
        setExecuteLocked(false);
        setExecuteMessage(t('settings.autoSync.scrapeNowBusy'));
        return;
      }

      // Selesai (ok / no_targets / disabled / not_ready / throw path) → factory defaults.
      const defaults = resetAutoScrapeToFactoryDefaults();
      applyFactoryToUi(defaults);
      setExecuteLocked(false);
      if (result.ok) {
        setExecuteMessage(t('settings.autoSync.executedScrapeNow'));
        return;
      }
      if (result.reason === 'no_targets') {
        setExecuteMessage(t('settings.autoSync.scrapeNowNoTargets'));
        return;
      }
      if (result.reason === 'disabled') {
        setExecuteMessage(t('settings.autoSync.scrapeNowDisabled'));
        return;
      }
      setExecuteMessage(t('settings.autoSync.scrapeNowNotReady'));
    } catch {
      const defaults = resetAutoScrapeToFactoryDefaults();
      applyFactoryToUi(defaults);
      setExecuteLocked(false);
      setExecuteMessage(t('settings.autoSync.scrapeNowNotReady'));
    }
  }, [
    applyFactoryToUi,
    cycleRunning,
    dirty,
    draftAccountMap,
    draftEnabled,
    draftScheduledHour,
    draftScrapeNow,
    draftToggles,
    enabledBrandCount,
    executeLocked,
    setEnabled,
    setScheduledHour,
    t,
  ]);

  const onToggleScrapeNow = useCallback(() => {
    setExecuteMessage(null);
    if (draftScrapeNow) {
      // On → Off: kembali ke Default jadwal (6 brand, Scheduled On, Scrape Now Off).
      const defaults = getAutoScrapeFactoryDefaults();
      setDraftScrapeNow(false);
      setDraftEnabled(true);
      setDraftScheduledHour(defaults.scheduledHour);
      setDraftToggles(defaults.toggles);
      setDraftAccountMap(defaults.accountMap);
      return;
    }
    if (scrapeNowToggleBlocked) return;
    // Off → On: SEMUA brand False (0/6). On Scheduled wajib True.
    // Abaikan checklist jadwal — user pilih brand Scrape Now sendiri.
    setDraftScrapeNow(true);
    setDraftEnabled(true);
    setDraftToggles(buildScrapeNowEmptyBrandToggles());
    setDraftAccountMap({});
  }, [draftScrapeNow, scrapeNowToggleBlocked]);

  // Guard keras: setiap kali masuk mode Scrape Now → checklist wajib kosong.
  const scrapeNowPrevRef = useRef(false);
  useEffect(() => {
    const entered = draftScrapeNow && !scrapeNowPrevRef.current;
    scrapeNowPrevRef.current = draftScrapeNow;
    if (!entered) return;
    setDraftEnabled(true);
    setDraftToggles(buildScrapeNowEmptyBrandToggles());
    setDraftAccountMap({});
  }, [draftScrapeNow]);

  const onToggleOnScheduled = useCallback(() => {
    setExecuteMessage(null);
    if (draftScrapeNow && draftEnabled) {
      // Scrape Now On → On Scheduled tidak boleh Off (wajib True).
      return;
    }
    setDraftEnabled(!draftEnabled);
  }, [draftEnabled, draftScrapeNow]);

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
          hideRunHistory={draftScrapeNow}
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
      draftScrapeNow,
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
              onClick={onToggleOnScheduled}
              disabled={draftScrapeNow && draftEnabled}
              title={
                draftScrapeNow && draftEnabled
                  ? t('settings.autoSync.onScheduledLockedByScrapeNow')
                  : undefined
              }
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
                scrapeNowToggleBlocked && 'opacity-50',
              )}
              onClick={onToggleScrapeNow}
              disabled={scrapeNowToggleBlocked}
              title={
                scrapeNowToggleBlocked
                  ? t('settings.autoSync.scrapeNowBlockedScheduledRunning')
                  : undefined
              }
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
        ) : cycleRunning ? (
          <p className="operations-stock-policy-footer__status" role="status">
            {t('settings.autoSync.executeRunningHint')}
          </p>
        ) : null}
        <div className="operations-stock-policy-actions">
          <button
            type="button"
            className="operations-stock-policy-discard-btn"
            onClick={handleCancelOrDiscard}
            disabled={secondaryDisabled}
          >
            {draftScrapeNow
              ? t('settings.autoSync.discard')
              : t('settings.autoSync.cancel')}
          </button>
          <button
            type="button"
            className="operations-stock-policy-save-btn"
            onClick={() => void handleSaveOrExecute()}
            disabled={primaryDisabled}
          >
            {cycleRunning || executeLocked
              ? t('settings.autoSync.executeRunning')
              : draftScrapeNow
                ? t('settings.autoSync.execute')
                : t('settings.autoSync.save')}
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
