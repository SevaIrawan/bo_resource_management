import { Lock, Plus } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';

interface AddBrandCardProps {
  onClick: () => void;
  locked?: boolean;
}

export function AddBrandCard({ onClick, locked = false }: AddBrandCardProps) {
  const { t } = useLanguage();

  return (
    <button
      type="button"
      className={cn('brand-add-card', locked && 'brand-add-card--locked')}
      onClick={locked ? undefined : onClick}
      disabled={locked}
      title={locked ? t('permissions.adminOnlyAction') : undefined}
    >
      <span className="brand-add-card-icon" aria-hidden>
        {locked ? (
          <Lock className="h-5 w-5" strokeWidth={2} />
        ) : (
          <Plus className="h-5 w-5" strokeWidth={2} />
        )}
      </span>
      <span className="brand-add-card-caption">{t('groupMonitoring.accountCard.addCardView')}</span>
    </button>
  );
}
