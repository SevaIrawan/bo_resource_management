import { Loader2, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';

interface ScrapeProgressModalProps {
  open: boolean;
  accountName: string;
  onClose: () => void;
}

export function ScrapeProgressModal({ open, accountName, onClose }: ScrapeProgressModalProps) {
  const { t } = useLanguage();

  if (!open) return null;

  return (
    <BrandModalRoot>
      <div
        className="brand-modal-panel platform-login-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scrape-progress-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="platform-login-header">
          <div className="platform-login-heading">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--color-tg)]" />
            <div className="min-w-0">
              <h2 id="scrape-progress-title" className="platform-login-title">
                {t('groupMonitoring.sync.scrapingTitle')}
              </h2>
              <p className="platform-login-subtitle">{accountName}</p>
            </div>
          </div>
          <button
            type="button"
            className="brand-modal-close"
            onClick={onClose}
            aria-label={t('groupMonitoring.accountCard.closeModal')}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className="platform-login-body platform-login-body--form">
          <p className="platform-login-hint">{t('groupMonitoring.sync.scrapingMessage')}</p>
        </div>
      </div>
    </BrandModalRoot>
  );
}
