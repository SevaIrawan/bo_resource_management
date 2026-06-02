import { Lock, X } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';

export function CardDismissButton({
  onDismiss,
  className = 'card-header-dismiss-btn',
  locked = false,
}: {
  onDismiss?: () => void;
  className?: string;
  locked?: boolean;
}) {
  const { t } = useLanguage();
  const lockedTitle = t('permissions.adminOnlyAction');

  if (locked) {
    return (
      <button
        type="button"
        className={cn(className, 'card-header-dismiss-btn--locked')}
        disabled
        aria-label={lockedTitle}
        title={lockedTitle}
      >
        <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>
    );
  }

  if (!onDismiss) return null;

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
