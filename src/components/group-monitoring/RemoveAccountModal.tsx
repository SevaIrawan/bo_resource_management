import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';
import { accountPlatformSubtitle } from '@/lib/platformSyncCopy';
import type { Platform } from '@/types/database';

interface RemoveAccountModalProps {
  open: boolean;
  accountName: string;
  platform: Platform;
  brandName: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function RemoveAccountModal({
  open,
  accountName,
  platform,
  brandName,
  saving = false,
  error = null,
  onClose,
  onConfirm,
}: RemoveAccountModalProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  const accountLine = `${accountPlatformSubtitle(accountName, platform)} · ${brandName}`;

  return (
    <BrandModalRoot onBackdropClick={saving ? undefined : onClose}>
      <div
        className="brand-modal-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-account-line"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 id="remove-account-line" className="brand-modal-title">
            {accountLine}
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
          <p className="sync-modal-message">{t('groupMonitoring.accountCard.removeFromSlotBody')}</p>

          {error ? (
            <p className="sync-modal-message sync-modal-message--error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="brand-modal-actions">
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--ghost"
              disabled={saving}
              onClick={onClose}
            >
              {t('groupMonitoring.accountCard.cancel')}
            </button>
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--danger"
              disabled={saving}
              onClick={onConfirm}
            >
              {saving
                ? t('groupMonitoring.accountCard.removingAccount')
                : t('groupMonitoring.accountCard.removeFromSlotConfirm')}
            </button>
          </div>
        </div>
      </div>
    </BrandModalRoot>
  );
}
