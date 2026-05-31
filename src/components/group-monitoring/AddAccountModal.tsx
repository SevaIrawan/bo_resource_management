import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { BrandImage } from '@/components/brand/BrandImage';
import { AddAccountPlatformBadge } from '@/components/group-monitoring/AddAccountHeaderMenu';
import { normalizePhoneDigits } from '@/lib/phoneNormalize';
import { useLanguage } from '@/hooks/useLanguage';
import type { Platform } from '@/types/database';

export interface AddAccountFormValues {
  accountName: string;
  phoneNumber: string;
}

interface AddAccountModalProps {
  open: boolean;
  platform: Platform | null;
  brandName: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: AddAccountFormValues, platform: Platform) => void;
}

export function AddAccountModal({
  open,
  platform,
  brandName,
  saving = false,
  error = null,
  onClose,
  onSubmit,
}: AddAccountModalProps) {
  const { t } = useLanguage();
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(platform);
  const [accountName, setAccountName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setSelectedPlatform(platform);
    setAccountName('');
    setPhoneNumber('');
    setLocalError(null);
  }, [open, platform]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!selectedPlatform) {
      setLocalError(t('groupMonitoring.accountCard.platformRequired'));
      return;
    }

    const name = accountName.trim();
    const phone = phoneNumber.trim();

    if (!name) {
      setLocalError(t('groupMonitoring.accountCard.accNameRequired'));
      return;
    }

    if (!phone || normalizePhoneDigits(phone).length < 8) {
      setLocalError(t('groupMonitoring.accountCard.phoneRequired'));
      return;
    }

    setLocalError(null);
    onSubmit({ accountName: name, phoneNumber: phone }, selectedPlatform);
  }

  const displayError = localError ?? error;

  return (
    <BrandModalRoot onBackdropClick={saving ? undefined : onClose}>
      <div
        className="brand-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-account-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <div className="min-w-0">
            <h2 id="add-account-title" className="brand-modal-title">
              {t('groupMonitoring.accountCard.addAccountTitle')}
            </h2>
            <p className="brand-modal-subtitle">{brandName}</p>
          </div>
          <button
            type="button"
            className="brand-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label={t('groupMonitoring.accountCard.closeModal')}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <form className="brand-modal-form" onSubmit={handleSubmit}>
          {!selectedPlatform ? (
            <div className="brand-modal-platform-pick">
              <p className="brand-modal-label">{t('groupMonitoring.accountCard.selectPlatform')}</p>
              <div className="brand-modal-platform-grid">
                <button
                  type="button"
                  className="brand-add-account-platform brand-add-account-platform--block"
                  onClick={() => setSelectedPlatform('whatsapp')}
                >
                  <span className="brand-add-account-platform-icon brand-add-account-platform-icon--wa">
                    <BrandImage asset="whatsapp" alt="WhatsApp" className="h-4 w-4" />
                  </span>
                  WhatsApp
                </button>
                <button
                  type="button"
                  className="brand-add-account-platform brand-add-account-platform--block"
                  onClick={() => setSelectedPlatform('telegram')}
                >
                  <span className="brand-add-account-platform-icon brand-add-account-platform-icon--tg">
                    <BrandImage asset="telegram" alt="Telegram" className="h-4 w-4" />
                  </span>
                  Telegram
                </button>
              </div>
            </div>
          ) : (
            <>
              <AddAccountPlatformBadge platform={selectedPlatform} />

              <label htmlFor="add-account-name" className="brand-modal-label">
                {t('groupMonitoring.accountCard.accNameLabel')}
              </label>
              <input
                id="add-account-name"
                type="text"
                value={accountName}
                onChange={(event) => {
                  setAccountName(event.target.value);
                  if (localError) setLocalError(null);
                }}
                placeholder={t('groupMonitoring.accountCard.accNamePlaceholder')}
                className="brand-modal-input"
                disabled={saving}
                autoFocus
              />

              <label htmlFor="add-account-phone" className="brand-modal-label">
                {t('groupMonitoring.accountCard.phoneLabel')}
                <span className="brand-modal-label-optional">
                  {' '}
                  ({t('groupMonitoring.accountCard.optional')})
                </span>
              </label>
              <input
                id="add-account-phone"
                type="text"
                value={phoneNumber}
                onChange={(event) => {
                  setPhoneNumber(event.target.value);
                  if (localError) setLocalError(null);
                }}
                placeholder={t('groupMonitoring.accountCard.phonePlaceholder')}
                className="brand-modal-input"
                disabled={saving}
              />
            </>
          )}

          {displayError ? <p className="brand-modal-error">{displayError}</p> : null}

          <div className="brand-modal-actions">
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--ghost"
              onClick={onClose}
              disabled={saving}
            >
              {t('groupMonitoring.accountCard.cancel')}
            </button>
            {selectedPlatform ? (
              <button
                type="submit"
                className="brand-modal-btn brand-modal-btn--primary"
                disabled={saving}
              >
                {saving
                  ? t('groupMonitoring.accountCard.savingAccount')
                  : t('groupMonitoring.accountCard.saveAccount')}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </BrandModalRoot>
  );
}
