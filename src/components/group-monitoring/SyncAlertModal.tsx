import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';
import { accountPlatformSubtitle } from '@/lib/platformSyncCopy';
import { cn } from '@/lib/utils';
import type { Platform } from '@/types/database';

interface SyncAlertModalProps {
  open: boolean;
  message: string;
  accountName?: string;
  platform?: Platform;
  tone?: 'error' | 'neutral';
  onClose: () => void;
}

export function SyncAlertModal({
  open,
  message,
  accountName,
  platform,
  tone = 'error',
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

  const headerLine =
    accountName && platform
      ? accountPlatformSubtitle(accountName, platform)
      : accountName ?? t('groupMonitoring.sync.errorTitle');

  return (
    <BrandModalRoot open={open && Boolean(message.trim())} onBackdropClick={onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--sync"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sync-alert-line"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 id="sync-alert-line" className="brand-modal-title">
            {headerLine}
          </h2>
          <button type="button" className="brand-modal-close" onClick={onClose}>
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>
        <div className="brand-modal-form">
          <p
            className={cn(
              'sync-modal-message',
              tone === 'error' && 'sync-modal-message--error',
            )}
          >
            {message}
          </p>
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
