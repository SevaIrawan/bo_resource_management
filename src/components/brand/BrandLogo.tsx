import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { BrandLogoMark } from './BrandLogoMark';
import { SidebarLabel } from '@/components/layout/SidebarLabel';

interface BrandLogoProps {
  collapsed?: boolean;
  className?: string;
}

export function BrandLogo({ collapsed = false, className }: BrandLogoProps) {
  const { t } = useLanguage();

  return (
    <div className={cn('sidebar-brand-block', className)}>
      <BrandLogoMark alt={t('brand.name')} size="md" />
      <SidebarLabel collapsed={collapsed} className="sidebar-brand-label min-w-0 leading-tight">
        <span className="sidebar-brand-title">{t('brand.name')}</span>
        <span className="sidebar-brand-tagline">{t('brand.tagline')}</span>
      </SidebarLabel>
    </div>
  );
}
