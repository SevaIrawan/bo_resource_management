import { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';

interface SyncSuccessModalProps {
  open: boolean;
  accountName: string;
  onClose: () => void;
}

export function SyncSuccessModal({ open, accountName, onClose }: SyncSuccessModalProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <BrandModalRoot onBackdropClick={onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--sync"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-success-line"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 id="sync-success-line" className="brand-modal-title">
            {accountName}
          </h2>
          <button
            type="button"
            className="brand-modal-close"
            onClick={onClose}
            aria-label={t('groupMonitoring.accountCard.closeModal')}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className="brand-modal-form">
          <div className="sync-success-body">
            <CheckCircle2 className="sync-success-icon" strokeWidth={1.75} aria-hidden />
            <p className="sync-modal-message">{t('groupMonitoring.sync.successMessage')}</p>
          </div>

          <div className="brand-modal-actions">
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--primary"
              onClick={onClose}
            >
              {t('groupMonitoring.sync.ok')}
            </button>
          </div>
        </div>
      </div>
    </BrandModalRoot>
  );
}
