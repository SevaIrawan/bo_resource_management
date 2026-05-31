import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';
import { accountPlatformSubtitle } from '@/lib/platformSyncCopy';
import type { Platform } from '@/types/database';

interface SyncSessionModalProps {
  open: boolean;
  message: string;
  accountName: string;
  platform?: Platform;
  onClose: () => void;
  onRunScraper?: () => void;
}

export function SyncSessionModal({
  open,
  message,
  accountName,
  platform,
  onClose,
  onRunScraper,
}: SyncSessionModalProps) {
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
        aria-labelledby="sync-session-line"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 id="sync-session-line" className="brand-modal-title">
            {platform ? accountPlatformSubtitle(accountName, platform) : accountName}
          </h2>
          <button type="button" className="brand-modal-close" onClick={onClose}>
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>
        <div className="brand-modal-form">
          <p className="sync-modal-message">{message}</p>
          <div className="brand-modal-actions">
            <button type="button" className="brand-modal-btn brand-modal-btn--ghost" onClick={onClose}>
              {onRunScraper ? t('groupMonitoring.sync.notNow') : t('groupMonitoring.sync.ok')}
            </button>
            {onRunScraper ? (
              <button
                type="button"
                className="brand-modal-btn brand-modal-btn--primary"
                onClick={onRunScraper}
              >
                {t('groupMonitoring.sync.scrapeNow')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </BrandModalRoot>
  );
}
