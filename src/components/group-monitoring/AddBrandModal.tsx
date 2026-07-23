import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';

interface AddBrandModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (brandName: string) => void;
}

export function AddBrandModal({ open, onClose, onSubmit }: AddBrandModalProps) {
  const { t } = useLanguage();
  const [brandName, setBrandName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setBrandName('');
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const value = brandName.trim();
    if (!value) {
      setError(t('groupMonitoring.accountCard.brandNameRequired'));
      return;
    }

    onSubmit(value);
    onClose();
  }

  return (
    <BrandModalRoot open={open} onBackdropClick={onClose}>
      <div
        className="brand-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-brand-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 id="add-brand-title" className="brand-modal-title">
            {t('groupMonitoring.accountCard.addBrandTitle')}
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

        <form className="brand-modal-form" onSubmit={handleSubmit}>
          <label htmlFor="add-brand-name" className="brand-modal-label">
            {t('groupMonitoring.accountCard.brandNameLabel')}
          </label>
          <input
            id="add-brand-name"
            type="text"
            value={brandName}
            onChange={(event) => {
              setBrandName(event.target.value);
              if (error) setError(null);
            }}
            placeholder={t('groupMonitoring.accountCard.brandNamePlaceholder')}
            className="brand-modal-input"
            autoFocus
          />
          {error ? <p className="brand-modal-error">{error}</p> : null}

          <div className="brand-modal-actions">
            <button type="button" className="brand-modal-btn brand-modal-btn--ghost" onClick={onClose}>
              {t('groupMonitoring.accountCard.cancel')}
            </button>
            <button type="submit" className="brand-modal-btn brand-modal-btn--primary">
              {t('groupMonitoring.accountCard.createBrandCard')}
            </button>
          </div>
        </form>
      </div>
    </BrandModalRoot>
  );
}
