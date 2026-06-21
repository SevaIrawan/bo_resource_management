import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { AddAccountPlatformBadge } from '@/components/group-monitoring/AddAccountHeaderMenu';
import { LocationDeviceSelect } from '@/components/group-monitoring/LocationDeviceSelect';
import { normalizeLocationDeviceOption } from '@/config/locationDeviceOptions';
import { normalizePhoneDigits } from '@/lib/phoneNormalize';
import { useLanguage } from '@/hooks/useLanguage';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

export interface EditAccountFormValues {
  accountName: string;
  phoneNumber: string;
  locationDevice: string;
}

interface EditAccountModalProps {
  open: boolean;
  account: AccountBrandRow | null;
  brandName: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: EditAccountFormValues) => void;
}

export function EditAccountModal({
  open,
  account,
  brandName,
  saving = false,
  error = null,
  onClose,
  onSubmit,
}: EditAccountModalProps) {
  const { t } = useLanguage();
  const [accountName, setAccountName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [locationDevice, setLocationDevice] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !account) return;

    setAccountName(account.accountName);
    setPhoneNumber(account.phoneNumber ?? '');
    setLocationDevice(normalizeLocationDeviceOption(account.locationDevice ?? ''));
    setLocalError(null);
  }, [open, account]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  if (!open || !account) return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

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
    onSubmit({
      accountName: name,
      phoneNumber: phone,
      locationDevice: locationDevice.trim(),
    });
  }

  const displayError = localError ?? error;

  return (
    <BrandModalRoot onBackdropClick={saving ? undefined : onClose}>
      <div
        className="brand-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-account-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <div className="min-w-0">
            <h2 id="edit-account-title" className="brand-modal-title">
              {t('groupMonitoring.accountCard.editAccountTitle')}
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
          <AddAccountPlatformBadge platform={account.platform} />

          <label htmlFor="edit-account-name" className="brand-modal-label">
            {t('groupMonitoring.accountCard.accNameLabel')}
          </label>
          <input
            id="edit-account-name"
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

          <label htmlFor="edit-account-phone" className="brand-modal-label">
            {t('groupMonitoring.accountCard.phoneLabel')}
          </label>
          <input
            id="edit-account-phone"
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

          <label htmlFor="edit-account-location-device" className="brand-modal-label">
            {t('groupMonitoring.accountCard.locationDeviceLabel')}
            <span className="brand-modal-label-optional">
              {' '}
              ({t('groupMonitoring.accountCard.optional')})
            </span>
          </label>
          <LocationDeviceSelect
            id="edit-account-location-device"
            value={locationDevice}
            disabled={saving}
            onChange={(value) => {
              setLocationDevice(value);
              if (localError) setLocalError(null);
            }}
          />

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
            <button
              type="submit"
              className="brand-modal-btn brand-modal-btn--primary"
              disabled={saving}
            >
              {saving
                ? t('groupMonitoring.accountCard.savingAccount')
                : t('groupMonitoring.accountCard.saveAccount')}
            </button>
          </div>
        </form>
      </div>
    </BrandModalRoot>
  );
}
