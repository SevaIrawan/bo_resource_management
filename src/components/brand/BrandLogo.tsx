import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { BrandImage } from './BrandImage';
import { SidebarLabel } from '@/components/layout/SidebarLabel';

interface BrandLogoProps {
  collapsed?: boolean;
  className?: string;
}

export function BrandLogo({ collapsed = false, className }: BrandLogoProps) {
  const { t } = useLanguage();

  return (
    <div className={cn('flex min-w-0 items-center', className)}>
      <BrandImage
        asset="logo"
        alt={t('brand.name')}
        className="h-9 w-9 shrink-0 rounded-[10px] object-contain"
      />
      <SidebarLabel collapsed={collapsed} className="sidebar-brand-label leading-tight">
        <span className="block truncate text-sm font-semibold tracking-wide text-text-primary">
          {t('brand.name')}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-text-muted">
          {t('brand.tagline')}
        </span>
      </SidebarLabel>
    </div>
  );
}
