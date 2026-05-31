import { Menu } from 'lucide-react';
import { useSidebar } from '@/hooks/useSidebar';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/hooks/useAuth';
import { LiveClock } from '@/components/ui/LiveClock';
import { BrandImage } from '@/components/brand/BrandImage';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { toggle } = useSidebar();
  const { t } = useLanguage();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center justify-between border-b border-border-subtle bg-bg-shell px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={t('header.toggleSidebar')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-white/6 hover:text-text-primary"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <div className="header-title-block min-w-0">
          <h1 className="header-page-title truncate text-lg font-semibold leading-tight text-text-primary">
            {title}
          </h1>
          <LiveClock />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="header-welcome text-sm text-text-secondary">
          <span className="header-welcome-greeting">{t('header.welcome')},</span>{' '}
          <span className="font-medium text-text-primary">{user?.userName ?? '—'}</span>
        </span>

        <BrandImage
          asset="flagMy"
          alt={t('header.flagAlt')}
          className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/15"
        />
      </div>
    </header>
  );
}
