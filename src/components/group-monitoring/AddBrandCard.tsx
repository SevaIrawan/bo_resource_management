import { Plus } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

interface AddBrandCardProps {
  onClick: () => void;
}

export function AddBrandCard({ onClick }: AddBrandCardProps) {
  const { t } = useLanguage();

  return (
    <button type="button" className="brand-add-card" onClick={onClick}>
      <span className="brand-add-card-icon" aria-hidden>
        <Plus className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="brand-add-card-caption">{t('groupMonitoring.accountCard.addCardView')}</span>
    </button>
  );
}
