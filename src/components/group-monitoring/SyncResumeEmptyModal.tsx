import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';
import { accountPlatformSubtitle } from '@/lib/platformSyncCopy';
import type { Platform } from '@/types/database';

interface SyncResumeEmptyModalProps {
  open: boolean;
  accountName: string;
  platform?: Platform;
  onClose: () => void;
}

export function SyncResumeEmptyModal({
  open,
  accountName,
  platform = 'telegram',
  onClose,
}: SyncResumeEmptyModalProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <BrandModalRoot open={open} onBackdropClick={onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--sync"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-resume-empty-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 id="sync-resume-empty-title" className="brand-modal-title">
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
          <p className="sync-modal-message">{t('groupMonitoring.sync.resumeEmptyGroups')}</p>
          <div className="brand-modal-actions">
            <button
              type="button"
              className="brand-modal-btn brand-modal-btn--primary"
              onClick={onClose}
            >
              {t('groupMonitoring.sync.ok')}
            </button>
          </div>
        </div>
      </div>
    </BrandModalRoot>
  );
}
