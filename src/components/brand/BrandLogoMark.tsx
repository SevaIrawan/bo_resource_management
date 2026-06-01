import { cn } from '@/lib/utils';
import { BrandImage } from './BrandImage';
import type { BrandAssetKey } from '@/assets/brand';

interface BrandLogoMarkProps {
  asset?: BrandAssetKey;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASS = {
  sm: 'brand-logo-mark--sm',
  md: 'brand-logo-mark--md',
  lg: 'brand-logo-mark--lg',
} as const;

/** Logo bulat — ring gold tipis 1px, tanpa glow (referensi). */
export function BrandLogoMark({
  asset = 'logo',
  alt,
  size = 'md',
  className,
}: BrandLogoMarkProps) {
  return (
    <span className={cn('brand-logo-mark', SIZE_CLASS[size], className)}>
      <BrandImage asset={asset} alt={alt} className="brand-logo-mark__img" />
    </span>
  );
}
