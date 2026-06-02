import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { BrandImage } from '@/components/brand/BrandImage';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import type { Platform } from '@/types/database';

interface AddAccountHeaderMenuProps {
  onSelectPlatform: (platform: Platform) => void;
  locked?: boolean;
}

export function AddAccountHeaderMenu({
  onSelectPlatform,
  locked = false,
}: AddAccountHeaderMenuProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  function pick(platform: Platform) {
    onSelectPlatform(platform);
    setOpen(false);
  }

  if (locked) {
    return (
      <div className="brand-add-account-menu">
        <button
          type="button"
          className="brand-add-account-btn brand-add-account-btn--locked"
          disabled
          title={t('permissions.adminOnlyAction')}
        >
          <Lock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
          {t('groupMonitoring.accountCard.addAccount')}
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="brand-add-account-menu">
      <button
        type="button"
        className="brand-add-account-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        {t('groupMonitoring.accountCard.addAccount')}
      </button>

      {open ? (
        <div className="brand-add-account-dropdown" role="menu">
          <p className="brand-add-account-dropdown-title">
            {t('groupMonitoring.accountCard.selectPlatform')}
          </p>
          <button
            type="button"
            role="menuitem"
            className="brand-add-account-platform"
            onClick={() => pick('whatsapp')}
          >
            <span className="brand-add-account-platform-icon brand-add-account-platform-icon--wa">
              <BrandImage asset="whatsapp" alt="WhatsApp" className="h-4 w-4" />
            </span>
            WhatsApp
          </button>
          <button
            type="button"
            role="menuitem"
            className="brand-add-account-platform"
            onClick={() => pick('telegram')}
          >
            <span className="brand-add-account-platform-icon brand-add-account-platform-icon--tg">
              <BrandImage asset="telegram" alt="Telegram" className="h-4 w-4" />
            </span>
            Telegram
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AddAccountPlatformBadge({ platform }: { platform: Platform }) {
  const asset = platform === 'whatsapp' ? 'whatsapp' : 'telegram';

  return (
    <span
      className={cn(
        'brand-add-account-platform-badge',
        platform === 'whatsapp'
          ? 'brand-add-account-platform-badge--wa'
          : 'brand-add-account-platform-badge--tg',
      )}
    >
      <BrandImage asset={asset} alt={platform} className="h-4 w-4" />
      {platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
    </span>
  );
}
