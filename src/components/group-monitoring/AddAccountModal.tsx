import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { BrandImage } from '@/components/brand/BrandImage';
import { AddAccountPlatformBadge } from '@/components/group-monitoring/AddAccountHeaderMenu';
import { AccountOpsRoleSelect } from '@/components/group-monitoring/AccountOpsRoleSelect';
import { LocationDeviceSelect } from '@/components/group-monitoring/LocationDeviceSelect';
import { normalizeAccountOpsRole, type AccountOpsRole } from '@/config/accountOpsRole';
import { normalizePhoneDigits } from '@/lib/phoneNormalize';
import { listBrandWaBatchLetters, waBatchToken } from '@/lib/waAccountBatch';
import { useLanguage } from '@/hooks/useLanguage';
import type { Platform } from '@/types/database';

export interface AddAccountFormValues {
  accountName: string;
  phoneNumber: string;
  locationDevice: string;
  opsRole: AccountOpsRole;
  /** WhatsApp: huruf New Acc atau OLD. */
  waBatch?: string | null;
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
  const [locationDevice, setLocationDevice] = useState('');
  const [opsRole, setOpsRole] = useState<AccountOpsRole | ''>('');
  const [statusAcc, setStatusAcc] = useState<'new' | 'old' | ''>('');
  const [batchLetter, setBatchLetter] = useState('');
  const [batchLetters, setBatchLetters] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const isWhatsApp = selectedPlatform === 'whatsapp';

  useEffect(() => {
    if (!open) return;

    setSelectedPlatform(platform);
    setAccountName('');
    setPhoneNumber('');
    setLocationDevice('');
    setOpsRole('');
    setStatusAcc('');
    setBatchLetter('');
    setBatchLetters([]);
    setLocalError(null);
  }, [open, platform]);

  useEffect(() => {
    if (!open || selectedPlatform !== 'whatsapp') return;
    let cancelled = false;
    void listBrandWaBatchLetters(brandName)
      .then((letters) => {
        if (!cancelled) setBatchLetters(letters);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBatchLetters([]);
          setLocalError(err instanceof Error ? err.message : t('groupMonitoring.accountCard.saveAccountFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedPlatform, brandName, t]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

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

    if (selectedPlatform === 'whatsapp') {
      if (statusAcc !== 'new' && statusAcc !== 'old') {
        setLocalError(t('groupMonitoring.accountCard.statusAccRequired'));
        return;
      }
      const batchToken = waBatchToken(batchLetter);
      if (statusAcc === 'new' && !batchToken) {
        setLocalError(t('groupMonitoring.accountCard.batchRequired'));
        return;
      }
      setLocalError(null);
      onSubmit(
        {
          accountName: name,
          phoneNumber: phone,
          locationDevice: locationDevice.trim(),
          opsRole: 'gcs',
          waBatch: statusAcc === 'new' ? batchToken! : 'OLD',
        },
        selectedPlatform,
      );
      return;
    }

    const role = normalizeAccountOpsRole(opsRole);
    if (!role) {
      setLocalError(t('groupMonitoring.accountCard.opsRoleRequired'));
      return;
    }

    setLocalError(null);
    onSubmit(
      {
        accountName: name,
        phoneNumber: phone,
        locationDevice: locationDevice.trim(),
        opsRole: role,
      },
      selectedPlatform,
    );
  }

  const displayError = localError ?? error;
  const statusOptions = useMemo(
    () => [
      { value: '', label: t('groupMonitoring.accountCard.statusAccPlaceholder') },
      { value: 'new', label: t('groupMonitoring.accountCard.statusAccNew') },
      { value: 'old', label: t('groupMonitoring.accountCard.statusAccOld') },
    ],
    [t],
  );
  const batchOptions = useMemo(
    () => [
      { value: '', label: t('groupMonitoring.accountCard.batchSelectPlaceholder') },
      ...batchLetters.map((letter) => ({ value: letter, label: letter })),
    ],
    [batchLetters, t],
  );

  return (
    <BrandModalRoot open={open} onBackdropClick={saving ? undefined : onClose}>
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

              <div className="brand-modal-field-row">
                <div className="brand-modal-field-col">
                  <label htmlFor="add-account-location-device" className="brand-modal-label">
                    {t('groupMonitoring.accountCard.locationDeviceLabel')}
                    <span className="brand-modal-label-optional">
                      {' '}
                      ({t('groupMonitoring.accountCard.optional')})
                    </span>
                  </label>
                  <LocationDeviceSelect
                    id="add-account-location-device"
                    value={locationDevice}
                    disabled={saving}
                    onChange={(value) => {
                      setLocationDevice(value);
                      if (localError) setLocalError(null);
                    }}
                  />
                </div>
                <div className="brand-modal-field-col">
                  {isWhatsApp ? (
                    <>
                      <label htmlFor="add-account-status-acc" className="brand-modal-label">
                        {t('groupMonitoring.accountCard.statusAccLabel')}
                      </label>
                      <DarkSelect
                        id="add-account-status-acc"
                        value={statusAcc}
                        options={statusOptions}
                        disabledValues={batchLetters.length === 0 ? ['new'] : []}
                        disabled={saving}
                        ariaLabel={t('groupMonitoring.accountCard.statusAccLabel')}
                        className="brand-modal-select-wrap"
                        triggerClassName="brand-modal-select-trigger"
                        menuPlacement="up"
                        onChange={(next) => {
                          const status = next === 'new' || next === 'old' ? next : '';
                          setStatusAcc(status);
                          if (status !== 'new') setBatchLetter('');
                          if (localError) setLocalError(null);
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <label htmlFor="add-account-ops-role" className="brand-modal-label">
                        {t('groupMonitoring.accountCard.opsRoleLabel')}
                      </label>
                      <AccountOpsRoleSelect
                        id="add-account-ops-role"
                        value={opsRole}
                        disabled={saving}
                        onChange={(value) => {
                          setOpsRole(value);
                          if (localError) setLocalError(null);
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
              {isWhatsApp ? (
                <div className="brand-modal-field-col">
                  <label htmlFor="add-account-batch" className="brand-modal-label">
                    {t('groupMonitoring.accountCard.batchLabel')}
                  </label>
                  {statusAcc === 'new' ? (
                    <DarkSelect
                      id="add-account-batch"
                      value={batchLetter}
                      options={batchOptions}
                      disabled={saving || batchLetters.length === 0}
                      ariaLabel={t('groupMonitoring.accountCard.batchLabel')}
                      className="brand-modal-select-wrap"
                      triggerClassName="brand-modal-select-trigger"
                      menuPlacement="up"
                      onChange={(next) => {
                        setBatchLetter(next);
                        if (localError) setLocalError(null);
                      }}
                    />
                  ) : (
                    <input
                      id="add-account-batch"
                      className="brand-modal-input"
                      value={statusAcc === 'old' ? t('groupMonitoring.accountCard.oldAcc') : '—'}
                      readOnly
                      disabled
                    />
                  )}
                  {batchLetters.length === 0 ? (
                    <p className="brand-modal-label-optional">
                      {t('groupMonitoring.accountCard.noBatchYet')}
                    </p>
                  ) : null}
                </div>
              ) : null}
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
