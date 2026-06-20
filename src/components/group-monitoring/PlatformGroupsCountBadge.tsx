import type { MouseEvent } from 'react';
import { BrandImage } from '@/components/brand/BrandImage';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import type { Platform } from '@/types/database';

type PlatformGroupsCountBadgeProps = {
  platform: Platform;
  count: number;
  className?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
};

/** Badge WA/TG + jumlah group — lebar caption tetap (sampai ribuan). */
export function PlatformGroupsCountBadge({
  platform,
  count,
  className,
  onClick,
}: PlatformGroupsCountBadgeProps) {
  const { t } = useLanguage();
  const asset = platform === 'whatsapp' ? 'whatsapp' : 'telegram';
  const platformLabel = platform === 'whatsapp' ? 'WA' : 'TG';
  const suffix =
    platform === 'whatsapp'
      ? t('groupMonitoring.accountCard.platformGroupsBadgeWaSuffix')
      : t('groupMonitoring.accountCard.platformGroupsBadgeTgSuffix');
  const ariaLabel =
    platform === 'whatsapp'
      ? t('groupMonitoring.accountCard.platformGroupsBadgeWa', { count })
      : t('groupMonitoring.accountCard.platformGroupsBadgeTg', { count });

  const badgeClassName = cn(
    'brand-card-badge brand-card-badge--neutral brand-card-badge--split brand-card-badge--platform-groups',
    onClick && 'brand-card-badge--clickable',
    className,
  );

  const content = (
    <>
      <BrandImage asset={asset} alt="" className="inline h-3 w-3 shrink-0 opacity-80" aria-hidden />
      <span className="brand-card-badge-caption">
        <span>{platformLabel}</span>
        <span className="brand-card-badge-count">{count}</span>
        <span>{suffix}</span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={badgeClassName}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={badgeClassName} aria-label={ariaLabel}>
      {content}
    </span>
  );
}
