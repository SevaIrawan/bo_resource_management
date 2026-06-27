import {
  brandOperationsPolicyEquals,
  clampAvgNdWindowDays,
  clampReadyMinPercent,
  DEFAULT_READY_MIN_PERCENT,
  MAX_AVG_ND_WINDOW_DAYS,
  MAX_READY_MIN_PERCENT,
  MIN_AVG_ND_WINDOW_DAYS,
  MIN_READY_MIN_PERCENT,
  persistOperationsPolicyByBrand,
  readEffectiveBrandOperationsPolicy,
  readOperationsPolicyByBrand,
  type BrandOperationsPolicy,
  type OperationsPolicyByBrand,
} from '@/config/operationsStockPolicy';
import {
  normalizeStockPrefixCategoryConfig,
  persistStockPrefixCategoryConfig,
  readStockPrefixCategoryConfig,
  stockPrefixConfigEquals,
  type StockPrefixCategoryConfig,
} from '@/config/stockPrefixCategoryConfig';
import { AdminExpandCard } from '@/components/admin/AdminExpandCard';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { loadUserBrands } from '@/lib/brands';
import { resolveMonitoringUserId } from '@/lib/monitoringDataUser';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

function buildDraftForBrands(brandNames: string[], saved: OperationsPolicyByBrand): OperationsPolicyByBrand {
  const draft: OperationsPolicyByBrand = {};
  for (const brandName of brandNames) {
    draft[brandName] = { ...readEffectiveBrandOperationsPolicy(brandName, saved) };
  }
  return draft;
}

function draftHasChanges(
  brandNames: string[],
  draft: OperationsPolicyByBrand,
  saved: OperationsPolicyByBrand,
): boolean {
  return brandNames.some(
    (brand) =>
      !brandOperationsPolicyEquals(
        draft[brand] ?? readEffectiveBrandOperationsPolicy(brand, saved),
        readEffectiveBrandOperationsPolicy(brand, saved),
      ),
  );
}

function useUserBrandNames() {
  const { user } = useAuth();
  const [brandNames, setBrandNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setBrandNames([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void resolveMonitoringUserId(user.id, user.userName)
      .then((dataUserId) => loadUserBrands(dataUserId))
      .then((brands) => {
        if (cancelled) return;
        setBrandNames(brands.map((b) => b.name.trim()).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) setBrandNames([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.userName]);

  return { brandNames, loading };
}

interface OperationsStockSopNamingPanelProps {
  draft: StockPrefixCategoryConfig;
  dirty: boolean;
  saveMessage: string | null;
  onChange: (next: StockPrefixCategoryConfig) => void;
  onSave: () => void;
  onDiscard: () => void;
}

function OperationsStockSopNamingPanel({
  draft,
  dirty,
  saveMessage,
  onChange,
  onSave,
  onDiscard,
}: OperationsStockSopNamingPanelProps) {
  const { t } = useLanguage();

  function formatPattern(template: string): string {
    return template
      .replace(/\{stock\}/g, draft.prefix2StockToken.trim() || 'NEW')
      .replace(/\{suffix\}/g, draft.prefix3LeftSuffix.trim() || 'LG');
  }

  const prefix1Examples = [
    t('admin.operationsStock.prefix1Pattern1'),
    t('admin.operationsStock.prefix1Pattern2'),
    t('admin.operationsStock.prefix1Pattern3'),
    t('admin.operationsStock.prefix1Pattern4'),
  ];
  const prefix2Examples = [
    formatPattern(t('admin.operationsStock.prefix2Pattern1')),
    formatPattern(t('admin.operationsStock.prefix2Pattern2')),
    formatPattern(t('admin.operationsStock.prefix2Pattern3')),
  ];
  const prefix3Examples = [
    formatPattern(t('admin.operationsStock.prefix3Pattern1')),
    formatPattern(t('admin.operationsStock.prefix3Pattern2')),
  ];

  return (
    <div className="operations-sop-naming-panel">
      <p className="operations-stock-policy-col__desc">{t('admin.operationsStock.colNamingDesc')}</p>

      <div className="operations-sop-naming-rows">
        <div className="operations-sop-naming-row operations-sop-naming-row--block">
          <span className="operations-sop-naming-row__label">{t('admin.operationsStock.prefix1Label')}</span>
          <div className="operations-sop-naming-row__controls">
            <div className="operations-sop-naming-row__pattern">
              <span className="operations-sop-naming-row__token">{t('admin.operationsStock.prefixEmojiToken')}</span>
              <span className="operations-sop-naming-row__token">{t('admin.operationsStock.prefixBrandToken')}</span>
              <input
                type="text"
                className="operations-sop-naming-row__input"
                value={draft.prefix1UserToken}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    prefix1UserToken: event.target.value,
                  })
                }
                aria-label={t('admin.operationsStock.prefix1Token')}
                title={t('admin.operationsStock.prefixUserSlotHint')}
              />
            </div>
            <ul className="operations-sop-naming-row__examples">
              {prefix1Examples.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="operations-sop-naming-row operations-sop-naming-row--block">
          <span className="operations-sop-naming-row__label">{t('admin.operationsStock.prefix2Label')}</span>
          <div className="operations-sop-naming-row__controls">
            <div className="operations-sop-naming-row__pattern">
              <span className="operations-sop-naming-row__token">{t('admin.operationsStock.prefixEmojiToken')}</span>
              <span className="operations-sop-naming-row__token">{t('admin.operationsStock.prefixBrandToken')}</span>
              <input
                type="text"
                className="operations-sop-naming-row__input"
                value={draft.prefix2StockToken}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    prefix2StockToken: event.target.value,
                  })
                }
                aria-label={t('admin.operationsStock.prefix2Token')}
              />
            </div>
            <ul className="operations-sop-naming-row__examples">
              {prefix2Examples.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="operations-sop-naming-row operations-sop-naming-row--block">
          <span className="operations-sop-naming-row__label">{t('admin.operationsStock.prefix3Label')}</span>
          <div className="operations-sop-naming-row__controls">
            <div className="operations-sop-naming-row__pattern">
              <span className="operations-sop-naming-row__token">{t('admin.operationsStock.prefixEmojiToken')}</span>
              <span className="operations-sop-naming-row__token">{t('admin.operationsStock.prefixBrandToken')}</span>
              <span className="operations-sop-naming-row__token">{t('admin.operationsStock.prefixUserSlot')}</span>
              <input
                type="text"
                className="operations-sop-naming-row__input"
                value={draft.prefix3LeftSuffix}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    prefix3LeftSuffix: event.target.value,
                  })
                }
                aria-label={t('admin.operationsStock.prefix3Suffix')}
              />
            </div>
            <ul className="operations-sop-naming-row__examples">
              {prefix3Examples.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="operations-sop-naming-row operations-sop-naming-row--other">
          <span className="operations-sop-naming-row__label">{t('admin.operationsStock.prefixOtherLabel')}</span>
          <p className="operations-sop-naming-row__other-desc">{t('admin.operationsStock.prefixOtherDesc')}</p>
        </div>
      </div>

      <div className="operations-stock-policy-footer">
        {saveMessage ? (
          <p className="operations-stock-policy-footer__status" role="status">
            {saveMessage}
          </p>
        ) : null}
        <div className="operations-stock-policy-actions">
          <button
            type="button"
            className="operations-stock-policy-discard-btn"
            onClick={onDiscard}
            disabled={!dirty}
          >
            {t('admin.operationsStock.discard')}
          </button>
          <button
            type="button"
            className="operations-stock-policy-save-btn"
            onClick={onSave}
            disabled={!dirty}
          >
            {t('admin.operationsStock.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OperationsStockBrandPolicyCard() {
  const { t } = useLanguage();
  const { brandNames, loading } = useUserBrandNames();
  const [savedPolicy, setSavedPolicy] = useState<OperationsPolicyByBrand>(() =>
    readOperationsPolicyByBrand(),
  );
  const [draftPolicy, setDraftPolicy] = useState<OperationsPolicyByBrand>(() =>
    readOperationsPolicyByBrand(),
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const reloadSaved = useCallback(() => {
    const saved = readOperationsPolicyByBrand();
    setSavedPolicy(saved);
    setDraftPolicy(buildDraftForBrands(brandNames, saved));
  }, [brandNames]);

  useEffect(() => {
    reloadSaved();
  }, [reloadSaved]);

  useEffect(() => {
    const sync = () => reloadSaved();
    window.addEventListener('rm-operations-policy-changed', sync);
    return () => window.removeEventListener('rm-operations-policy-changed', sync);
  }, [reloadSaved]);

  const dirty = useMemo(
    () => draftHasChanges(brandNames, draftPolicy, savedPolicy),
    [brandNames, draftPolicy, savedPolicy],
  );

  const configuredCount = Object.keys(savedPolicy).length;
  const summary =
    configuredCount > 0
      ? t('admin.operationsStock.summaryConfigured', { count: configuredCount })
      : t('admin.operationsStock.summaryDefault', { percent: DEFAULT_READY_MIN_PERCENT });

  function patchBrandPolicy(brandName: string, patch: Partial<BrandOperationsPolicy>) {
    setSaveMessage(null);
    setDraftPolicy((prev) => {
      const current = prev[brandName] ?? readEffectiveBrandOperationsPolicy(brandName, savedPolicy);
      return {
        ...prev,
        [brandName]: {
          readyMinPercent: patch.readyMinPercent ?? current.readyMinPercent,
          avgNdWindowDays: patch.avgNdWindowDays ?? current.avgNdWindowDays,
        },
      };
    });
  }

  function handleSave() {
    const next: OperationsPolicyByBrand = { ...readOperationsPolicyByBrand() };
    for (const brandName of brandNames) {
      const row = draftPolicy[brandName] ?? readEffectiveBrandOperationsPolicy(brandName, savedPolicy);
      next[brandName] = {
        readyMinPercent: clampReadyMinPercent(row.readyMinPercent),
        avgNdWindowDays: clampAvgNdWindowDays(row.avgNdWindowDays),
      };
    }
    persistOperationsPolicyByBrand(next);
    setSavedPolicy(next);
    setDraftPolicy(buildDraftForBrands(brandNames, next));
    setSaveMessage(t('admin.operationsStock.saved'));
  }

  function handleDiscard() {
    setDraftPolicy(buildDraftForBrands(brandNames, savedPolicy));
    setSaveMessage(null);
  }

  return (
    <AdminExpandCard
      cardId="operations-stock-brand"
      title={t('admin.operationsStock.colStockTitle')}
      summary={summary}
    >
      <p className="operations-stock-policy-col__desc">{t('admin.operationsStock.colStockDesc')}</p>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('admin.operationsStock.loadingBrands')}
        </div>
      ) : brandNames.length === 0 ? (
        <p className="text-xs text-text-muted">{t('admin.operationsStock.noBrands')}</p>
      ) : (
        <div className="operations-stock-policy-block">
          <div className="operations-stock-policy-table-wrap">
            <table className="operations-stock-policy-table">
              <colgroup>
                <col className="operations-stock-policy-col-brand" />
                <col className="operations-stock-policy-col-num" />
                <col className="operations-stock-policy-col-num" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('admin.operationsStock.colBrand')}</th>
                  <th className="operations-stock-policy-table__num">
                    {t('admin.operationsStock.colMinReady')}
                  </th>
                  <th className="operations-stock-policy-table__num">
                    {t('admin.operationsStock.colAvgNdDays')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {brandNames.map((brandName) => {
                  const row =
                    draftPolicy[brandName] ??
                    readEffectiveBrandOperationsPolicy(brandName, savedPolicy);
                  const slug = brandName.replace(/\s+/g, '-');
                  return (
                    <tr key={brandName}>
                      <td className="operations-stock-policy-table__brand">{brandName}</td>
                      <td className="operations-stock-policy-table__num">
                        <input
                          id={`ops-ready-min-${slug}`}
                          type="number"
                          min={MIN_READY_MIN_PERCENT}
                          max={MAX_READY_MIN_PERCENT}
                          step={1}
                          value={row.readyMinPercent}
                          onChange={(e) =>
                            patchBrandPolicy(brandName, {
                              readyMinPercent: clampReadyMinPercent(Number(e.target.value)),
                            })
                          }
                          className="operations-stock-policy-table__input"
                          aria-label={t('admin.operationsStock.colMinReady')}
                        />
                      </td>
                      <td className="operations-stock-policy-table__num">
                        <input
                          id={`ops-avg-nd-${slug}`}
                          type="number"
                          min={MIN_AVG_ND_WINDOW_DAYS}
                          max={MAX_AVG_ND_WINDOW_DAYS}
                          step={1}
                          value={row.avgNdWindowDays}
                          onChange={(e) =>
                            patchBrandPolicy(brandName, {
                              avgNdWindowDays: clampAvgNdWindowDays(Number(e.target.value)),
                            })
                          }
                          className="operations-stock-policy-table__input"
                          aria-label={t('admin.operationsStock.colAvgNdDays')}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="operations-stock-policy-footer">
            {saveMessage ? (
              <p className="operations-stock-policy-footer__status" role="status">
                {saveMessage}
              </p>
            ) : null}
            <div className="operations-stock-policy-actions">
              <button
                type="button"
                className="operations-stock-policy-discard-btn"
                onClick={handleDiscard}
                disabled={!dirty}
              >
                {t('admin.operationsStock.discard')}
              </button>
              <button
                type="button"
                className="operations-stock-policy-save-btn"
                onClick={handleSave}
                disabled={!dirty}
              >
                {t('admin.operationsStock.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminExpandCard>
  );
}

export function OperationsStockSopNamingCard() {
  const { t } = useLanguage();
  const [savedPrefix, setSavedPrefix] = useState<StockPrefixCategoryConfig>(() =>
    readStockPrefixCategoryConfig(),
  );
  const [draftPrefix, setDraftPrefix] = useState<StockPrefixCategoryConfig>(() =>
    readStockPrefixCategoryConfig(),
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const reloadSaved = useCallback(() => {
    const prefix = readStockPrefixCategoryConfig();
    setSavedPrefix(prefix);
    setDraftPrefix(prefix);
  }, []);

  useEffect(() => {
    const sync = () => reloadSaved();
    window.addEventListener('rm-operations-policy-changed', sync);
    return () => window.removeEventListener('rm-operations-policy-changed', sync);
  }, [reloadSaved]);

  const dirty = useMemo(
    () => !stockPrefixConfigEquals(draftPrefix, savedPrefix),
    [draftPrefix, savedPrefix],
  );

  const summary = t('admin.operationsStock.summaryNaming', {
    p1: savedPrefix.prefix1UserToken,
    p2: savedPrefix.prefix2StockToken,
    p3: savedPrefix.prefix3LeftSuffix,
  });

  function handlePrefixChange(next: StockPrefixCategoryConfig) {
    setSaveMessage(null);
    setDraftPrefix(next);
  }

  function handleSave() {
    const nextPrefix = normalizeStockPrefixCategoryConfig(draftPrefix);
    persistStockPrefixCategoryConfig(nextPrefix);
    setSavedPrefix(nextPrefix);
    setDraftPrefix(nextPrefix);
    setSaveMessage(t('admin.operationsStock.prefixSaved'));
  }

  function handleDiscard() {
    setDraftPrefix(savedPrefix);
    setSaveMessage(null);
  }

  return (
    <AdminExpandCard
      cardId="operations-sop-naming"
      title={t('admin.operationsStock.colNamingTitle')}
      summary={summary}
    >
      <OperationsStockSopNamingPanel
        draft={draftPrefix}
        dirty={dirty}
        saveMessage={saveMessage}
        onChange={handlePrefixChange}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </AdminExpandCard>
  );
}
