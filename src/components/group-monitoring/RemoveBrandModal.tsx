import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';

interface RemoveBrandModalProps {
  open: boolean;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function RemoveBrandModal({
  open,
  saving = false,
  error = null,
  onClose,
  onConfirm,
}: RemoveBrandModalProps) {
  const { t } = useLanguage();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || saving) return;
    const frame = requestAnimationFrame(() => cancelRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, saving]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  return (
    <BrandModalRoot open={open} onBackdropClick={saving ? undefined : onClose}>
      <div
        className="brand-modal-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-brand-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 id="remove-brand-title" className="brand-modal-title">
            {t('groupMonitoring.removeBrandTitle')}
          </h2>
          <button
            type="button"
            className="brand-modal-close"
            disabled={saving}
            onClick={onClose}
            aria-label={t('groupMonitoring.accountCard.closeModal')}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className="brand-modal-form">
          <p className="sync-modal-message">{t('groupMonitoring.removeBrandBody')}</p>

          {error ? (
            <p className="sync-modal-message sync-modal-message--error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="brand-modal-actions">
            <button
              ref={cancelRef}
              type="button"
              className="brand-modal-btn brand-modal-btn--danger"
              disabled={saving}
              onClick={onClose}
            >
              {t('groupMonitoring.accountCard.cancel')}
            </button>
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--danger-muted"
              disabled={saving}
              onClick={onConfirm}
            >
              {saving ? t('groupMonitoring.removingBrand') : t('groupMonitoring.removeBrandConfirm')}
            </button>
          </div>
        </div>
      </div>
    </BrandModalRoot>
  );
}
