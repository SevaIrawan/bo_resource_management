import { X } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

export function CardDismissButton({
  onDismiss,
  className = 'card-header-dismiss-btn',
}: {
  onDismiss: () => void;
  className?: string;
}) {
  const { t } = useLanguage();

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        onDismiss();
      }}
      aria-label={t('groupMonitoring.dismissCard')}
      title={t('groupMonitoring.dismissCard')}
    >
      <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
    </button>
  );
}
