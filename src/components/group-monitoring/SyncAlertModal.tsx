import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';
import { accountPlatformSubtitle } from '@/lib/platformSyncCopy';
import type { Platform } from '@/types/database';

interface SyncAlertModalProps {
  open: boolean;
  title: string;
  message: string;
  accountName?: string;
  platform?: Platform;
  onClose: () => void;
}

export function SyncAlertModal({
  open,
  title,
  message,
  accountName,
  platform,
  onClose,
}: SyncAlertModalProps) {
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
        role="alertdialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 className="brand-modal-title">{title}</h2>
          <button type="button" className="brand-modal-close" onClick={onClose}>
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>
        <div className="brand-modal-form">
          {accountName ? (
            <p className="sync-modal-subtitle">
              {platform ? accountPlatformSubtitle(accountName, platform) : accountName}
            </p>
          ) : null}
          <p className="sync-modal-message sync-modal-message--error">{message}</p>
          <div className="brand-modal-actions">
            <button type="button" className="brand-modal-btn brand-modal-btn--primary" onClick={onClose}>
              {t('groupMonitoring.sync.ok')}
            </button>
          </div>
        </div>
      </div>
    </BrandModalRoot>
  );
}
