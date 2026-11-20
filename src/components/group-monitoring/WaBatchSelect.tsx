import { useEffect, useMemo, useState } from 'react';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { WA_BATCH_FULL, WA_BATCH_OLD, normalizeWaBatch } from '@/config/waBatch';
import { useLanguage } from '@/hooks/useLanguage';
import { fetchBrandWaBatchSummary, type WaBatchSummary } from '@/lib/waBatchLabels';

interface WaBatchSelectProps {
  id: string;
  brandName: string;
  value: string;
  /** Batch tersimpan saat edit — tetap jadi opsi walau tidak ada di label (mis. OLD). */
  currentValue?: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/**
 * Pilihan batch akun WA: batch label grup yang ada di brand (043) + Full Group.
 * OLD hanya muncul untuk akun yang memang OLD (akun lama), tidak untuk akun baru.
 */
export function WaBatchSelect({
  id,
  brandName,
  value,
  currentValue = null,
  disabled = false,
  onChange,
}: WaBatchSelectProps) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<WaBatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    fetchBrandWaBatchSummary(brandName)
      .then((rows) => {
        if (!cancelled) setSummary(rows);
      })
      .catch((error) => {
        console.warn('[wa-batch] load batch labels failed', error);
        if (!cancelled) {
          setSummary([]);
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandName]);

  const current = normalizeWaBatch(currentValue);

  const options = useMemo(() => {
    const list: { value: string; label: string }[] = [
      { value: '', label: t('groupMonitoring.accountCard.waBatchSelectPlaceholder') },
    ];
    for (const row of summary) {
      list.push({
        value: row.batch,
        label: t('groupMonitoring.accountCard.waBatchOption', {
          batch: row.batch,
          count: row.active,
        }),
      });
    }
    // Batch tersimpan yang sudah tidak punya label aktif tetap bisa dipertahankan.
    if (current && current !== WA_BATCH_FULL && current !== WA_BATCH_OLD) {
      if (!summary.some((row) => row.batch === current)) {
        list.push({ value: current, label: current });
      }
    }
    list.push({ value: WA_BATCH_FULL, label: t('groupMonitoring.accountCard.waBatchFull') });
    if (current === WA_BATCH_OLD) {
      list.push({ value: WA_BATCH_OLD, label: t('groupMonitoring.accountCard.waBatchOld') });
    }
    return list;
  }, [summary, current, t]);

  return (
    <>
      <DarkSelect
        id={id}
        value={normalizeWaBatch(value) ?? ''}
        onChange={(next) => onChange(normalizeWaBatch(next) ?? '')}
        options={options}
        disabled={disabled || loading}
        ariaLabel={t('groupMonitoring.accountCard.waBatchLabel')}
        className="brand-modal-select-wrap"
        triggerClassName="brand-modal-select-trigger"
        menuPlacement="up"
      />
      {!loading && (loadFailed || summary.length === 0) ? (
        <p className="mt-1 text-[0.6875rem] text-text-secondary">
          {loadFailed
            ? t('groupMonitoring.accountCard.waBatchLoadFailed')
            : t('groupMonitoring.accountCard.waBatchNoLabels')}
        </p>
      ) : null}
    </>
  );
}
