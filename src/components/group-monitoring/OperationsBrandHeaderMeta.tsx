import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import {
  formatAvgNdDisplay,
  type GroupStockHeaderMeta,
} from '@/types/groupStock';

interface OperationsBrandHeaderMetaProps {
  meta: GroupStockHeaderMeta;
  /** To prep > 1 → klik To prep buka Create group job (brand terpilih). */
  onCreateGroup?: () => void;
}

function MetaDivider() {
  return (
    <span className="operations-brand-meta-divider" aria-hidden>
      |
    </span>
  );
}

/** Avg ND + To prep — kolom lebar tetap, sejajar antar brand card. */
export function OperationsBrandHeaderMeta({
  meta,
  onCreateGroup,
}: OperationsBrandHeaderMetaProps) {
  const { t } = useLanguage();
  const avgDisplay = formatAvgNdDisplay(meta.avgNd);
  const needsPrep = meta.stockToPrepare > 0;
  const toPrepClickable = Boolean(onCreateGroup) && meta.stockToPrepare > 1;

  const toPrepTooltip = needsPrep
    ? t('operations.brandCard.toPrepWarningTooltip', {
        gap: meta.stockToPrepare,
        percent: meta.minReadyPercent,
        ready: meta.readyCount,
        target: meta.minReadyTarget,
        total: meta.totalMasterGroups,
      })
    : t('operations.brandCard.toPrepOkTooltip', {
        percent: meta.minReadyPercent,
        ready: meta.readyCount,
        target: meta.minReadyTarget,
        total: meta.totalMasterGroups,
      });

  const toPrepInner = (
    <>
      <span className="operations-brand-meta-label">{t('operations.brandCard.toPrep')}</span>
      <span
        className={cn(
          'operations-brand-meta-value',
          needsPrep && 'operations-brand-meta-value--warning',
          toPrepClickable && 'brand-gap-metric brand-gap-metric--link',
        )}
      >
        {meta.stockToPrepare}
      </span>
    </>
  );

  return (
    <>
      <MetaDivider />
      <span
        className="operations-brand-col-metric"
        title={t('operations.brandCard.avgNdTooltip', { days: meta.avgNdWindowDays })}
      >
        <span className="operations-brand-meta-label">{t('operations.brandCard.avgNd')}</span>
        <span className="operations-brand-meta-value">{avgDisplay}</span>
      </span>
      <MetaDivider />
      {toPrepClickable ? (
        <button
          type="button"
          className={cn(
            'operations-brand-col-metric',
            'brand-metric-hit',
            'operations-brand-col-metric--to-prep-hit',
            needsPrep && 'operations-brand-col-metric--warning',
          )}
          title={t('operations.brandCard.createGroupCtaTooltip')}
          aria-label={t('operations.brandCard.createGroupCtaTooltip')}
          onClick={() => onCreateGroup?.()}
        >
          {toPrepInner}
        </button>
      ) : (
        <span
          className={cn(
            'operations-brand-col-metric',
            needsPrep && 'operations-brand-col-metric--warning',
          )}
          title={toPrepTooltip}
          aria-label={toPrepTooltip}
        >
          {toPrepInner}
        </span>
      )}
    </>
  );
}
