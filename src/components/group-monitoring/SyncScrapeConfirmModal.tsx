import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';
import { postLoginScrapeMessage } from '@/lib/platformSyncCopy';
import type { Platform } from '@/types/database';

interface SyncScrapeConfirmModalProps {
  open: boolean;
  accountName: string;
  platform?: Platform;
  rescrape?: boolean;
  /** Setelah login sukses — tanya jalankan scraper atau nanti */
  postLogin?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function SyncScrapeConfirmModal({
  open,
  accountName,
  platform = 'telegram',
  rescrape = false,
  postLogin = false,
  onClose,
  onConfirm,
}: SyncScrapeConfirmModalProps) {
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
        aria-labelledby="sync-scrape-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 id="sync-scrape-title" className="brand-modal-title">
            {postLogin
              ? t('groupMonitoring.sync.postLoginScrapeTitle')
              : rescrape
                ? t('groupMonitoring.sync.rescrapeTitle')
                : t('groupMonitoring.sync.noDataTitle')}
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
          <p className="sync-modal-message">
            {postLogin
              ? postLoginScrapeMessage(platform, accountName, t)
              : rescrape
                ? t('groupMonitoring.sync.rescrapeMessage', { account: accountName })
                : t('groupMonitoring.sync.noDataMessage', { account: accountName })}
          </p>

          <div className="brand-modal-actions">
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--ghost"
              onClick={onClose}
            >
              {t('groupMonitoring.sync.notNow')}
            </button>
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--primary"
              onClick={onConfirm}
            >
              {t('groupMonitoring.sync.scrapeNow')}
            </button>
          </div>
        </div>
      </div>
    </BrandModalRoot>
  );
}
