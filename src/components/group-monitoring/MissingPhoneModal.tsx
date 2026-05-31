import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';
import { hasValidAccountPhone } from '@/lib/accountPhone';

interface MissingPhoneModalProps {
  open: boolean;
  accountName: string;
  initialPhone?: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (phoneNumber: string) => void;
}

export function MissingPhoneModal({
  open,
  accountName,
  initialPhone = '',
  saving = false,
  error = null,
  onClose,
  onSave,
}: MissingPhoneModalProps) {
  const { t } = useLanguage();
  const [phone, setPhone] = useState(initialPhone);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhone(initialPhone);
      setLocalError(null);
    }
  }, [open, initialPhone]);

  if (!open) return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = phone.trim();
    if (!hasValidAccountPhone(value)) {
      setLocalError(t('groupMonitoring.accountCard.phoneRequired'));
      return;
    }
    setLocalError(null);
    onSave(value);
  }

  const displayError = localError ?? error;

  return (
    <BrandModalRoot onBackdropClick={saving ? undefined : onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--sync"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 className="brand-modal-title">{t('groupMonitoring.sync.missingPhoneTitle')}</h2>
          <button type="button" className="brand-modal-close" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>
        <form className="brand-modal-form" onSubmit={handleSubmit}>
          <p className="sync-modal-subtitle">{accountName}</p>
          <p className="sync-modal-message">{t('groupMonitoring.sync.missingPhoneMessage')}</p>
          <label className="platform-login-label" htmlFor="missing-phone-input">
            {t('groupMonitoring.accountCard.phoneLabel')}
          </label>
          <input
            id="missing-phone-input"
            type="tel"
            className="platform-login-input"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t('groupMonitoring.sync.loginPhonePlaceholder')}
            disabled={saving}
            autoFocus
          />
          {displayError ? (
            <p className="platform-login-field-error" role="alert">
              {displayError}
            </p>
          ) : null}
          <div className="brand-modal-actions">
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--ghost"
              onClick={onClose}
              disabled={saving}
            >
              {t('groupMonitoring.accountCard.cancel')}
            </button>
            <button
              type="submit"
              className="brand-modal-btn brand-modal-btn--primary"
              disabled={saving}
            >
              {saving
                ? t('groupMonitoring.accountCard.savingAccount')
                : t('groupMonitoring.sync.savePhoneAndSync')}
            </button>
          </div>
        </form>
      </div>
    </BrandModalRoot>
  );
}
