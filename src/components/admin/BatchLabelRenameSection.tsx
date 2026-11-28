import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { useLanguage } from '@/hooks/useLanguage';
import { listBrandWaBatchLetters, waBatchToken } from '@/lib/waAccountBatch';
import { getSupabase } from '@/lib/supabase';

interface BatchLabelRenameSectionProps {
  brandNames: string[];
  loadingBrands: boolean;
}

export function BatchLabelRenameSection({
  brandNames,
  loadingBrands,
}: BatchLabelRenameSectionProps) {
  const { t } = useLanguage();
  const [brandName, setBrandName] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!brandName) {
      setLabels([]);
      setDrafts({});
      return;
    }
    let cancelled = false;
    setLoadingLabels(true);
    setError(null);
    setMessage(null);
    void listBrandWaBatchLetters(brandName)
      .then((rows) => {
        if (cancelled) return;
        setLabels(rows);
        setDrafts(Object.fromEntries(rows.map((label) => [label, ''])));
      })
      .catch(() => {
        if (!cancelled) setError(t('admin.operationsStock.batchLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingLabels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandName, t]);

  const dirty = useMemo(
    () => labels.some((label) => (drafts[label] ?? '').trim() !== ''),
    [drafts, labels],
  );

  const brandOptions = useMemo(
    () => [
      { value: '', label: t('admin.operationsStock.batchBrandPlaceholder') },
      ...brandNames.map((name) => ({ value: name, label: name })),
    ],
    [brandNames, t],
  );

  async function handleSave() {
    const pairs: Array<{ from: string; to: string }> = [];
    const seen = new Set<string>();
    for (const label of labels) {
      const next = waBatchToken(drafts[label] ?? '');
      const typed = (drafts[label] ?? '').trim();
      if (!typed) continue;
      if (!next) {
        setError(t('admin.operationsStock.batchInvalid'));
        setMessage(null);
        return;
      }
      if (next === label) continue;
      const key = next.toLowerCase();
      if (seen.has(key)) {
        setError(t('admin.operationsStock.batchDuplicate'));
        setMessage(null);
        return;
      }
      seen.add(key);
      pairs.push({ from: label, to: next });
    }
    const sources = new Set(pairs.map((pair) => pair.from.toLowerCase()));
    if (
      pairs.some((pair) =>
        labels.some(
          (label) => label.toLowerCase() === pair.to.toLowerCase() && !sources.has(label.toLowerCase()),
        ),
      )
    ) {
      setError(t('admin.operationsStock.batchDuplicate'));
      setMessage(null);
      return;
    }
    if (pairs.length === 0) return;

    const supabase = getSupabase();
    if (!supabase) {
      setError(t('admin.operationsStock.batchSaveFailed'));
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: rpcError } = await supabase.rpc('rm_rename_brand_wa_batches', {
      p_brand: brandName,
      p_pairs: pairs,
    });
    setSaving(false);
    if (rpcError) {
      const raw = rpcError.message ?? '';
      if (raw.includes('BATCH_TARGET_EXISTS') || raw.includes('BATCH_DUPLICATE')) {
        setError(t('admin.operationsStock.batchDuplicate'));
      } else if (raw.includes('INVALID_TOKEN')) {
        setError(t('admin.operationsStock.batchInvalid'));
      } else {
        setError(t('admin.operationsStock.batchSaveFailed'));
      }
      return;
    }

    const refreshed = await listBrandWaBatchLetters(brandName);
    setLabels(refreshed);
    setDrafts(Object.fromEntries(refreshed.map((label) => [label, ''])));
    setMessage(t('admin.operationsStock.batchSaved'));
  }

  return (
    <div className="operations-sop-naming-panel">
      <p className="operations-stock-policy-col__desc">{t('admin.operationsStock.batchLabelDesc')}</p>
      {loadingBrands ? (
        <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('admin.operationsStock.loadingBrands')}
        </div>
      ) : brandNames.length === 0 ? (
        <p className="text-xs text-text-muted">{t('admin.operationsStock.noBrands')}</p>
      ) : (
        <>
          <label className="batch-label-brand" htmlFor="batch-label-brand">
            <span className="batch-label-brand__caption">{t('admin.operationsStock.colBrand')}</span>
            <DarkSelect
              id="batch-label-brand"
              value={brandName}
              onChange={setBrandName}
              options={brandOptions}
              ariaLabel={t('admin.operationsStock.colBrand')}
              menuPlacement="down"
            />
          </label>
          {loadingLabels ? (
            <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('admin.operationsStock.loadingBrands')}
            </div>
          ) : brandName && labels.length === 0 ? (
            <p className="text-xs text-text-muted">{t('admin.operationsStock.batchEmpty')}</p>
          ) : brandName ? (
            <div className="operations-stock-policy-table-wrap batch-label-table-wrap">
              <table className="operations-stock-policy-table batch-label-table">
                <colgroup>
                  <col className="batch-label-col" />
                  <col className="batch-label-col" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('admin.operationsStock.batchOld')}</th>
                    <th>{t('admin.operationsStock.batchNew')}</th>
                  </tr>
                </thead>
                <tbody>
                  {labels.map((label) => {
                    const draft = drafts[label] ?? '';
                    const changed = draft.trim() !== '';
                    return (
                      <tr key={label} className={changed ? 'batch-label-row--changed' : undefined}>
                        <td>
                          <span className="batch-label-old">{label}</span>
                        </td>
                        <td>
                          <input
                            className="batch-label-input"
                            value={draft}
                            placeholder={label}
                            aria-label={`${label} ${t('admin.operationsStock.batchNew')}`}
                            onChange={(event) => {
                              setError(null);
                              setMessage(null);
                              setDrafts((prev) => ({ ...prev, [label]: event.target.value }));
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="operations-stock-policy-footer">
            {message ? (
              <p className="operations-stock-policy-footer__status" role="status">
                {message}
              </p>
            ) : null}
            {error ? (
              <p className="operations-stock-policy-footer__status batch-label-footer__error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="operations-stock-policy-actions">
              <button
                type="button"
                className="operations-stock-policy-save-btn"
                disabled={!dirty || saving || !brandName}
                onClick={() => void handleSave()}
              >
                {saving ? t('admin.operationsStock.batchSaving') : t('admin.operationsStock.save')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
