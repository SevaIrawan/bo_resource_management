import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';
import { accountPlatformSubtitle } from '@/lib/platformSyncCopy';
import type { Platform } from '@/types/database';

interface ScrapeCancelConfirmModalProps {
  open: boolean;
  accountName: string;
  platform?: Platform;
  onClose: () => void;
  onConfirm: () => void;
}

export function ScrapeCancelConfirmModal({
  open,
  accountName,
  platform = 'telegram',
  onClose,
  onConfirm,
}: ScrapeCancelConfirmModalProps) {
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
        aria-labelledby="scrape-cancel-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 id="scrape-cancel-title" className="brand-modal-title">
            {accountPlatformSubtitle(accountName, platform)}
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
          <p className="sync-modal-message">{t('groupMonitoring.sync.cancelScrapeConfirmMessage')}</p>

          <div className="brand-modal-actions">
            <button type="button" className="brand-modal-btn brand-modal-btn--ghost" onClick={onClose}>
              {t('groupMonitoring.sync.cancelScrapeKeep')}
            </button>
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--danger"
              onClick={onConfirm}
            >
              {t('groupMonitoring.sync.cancelScrapeConfirm')}
            </button>
          </div>
        </div>
      </div>
    </BrandModalRoot>
  );
}
