import { cn } from '@/lib/utils';
import { getBrandAsset, type BrandAssetKey } from '@/assets/brand';

interface BrandImageProps {
  asset: BrandAssetKey;
  alt: string;
  className?: string;
}

/** Render asset dari `public/brand/` */
export function BrandImage({ asset, alt, className }: BrandImageProps) {
  return (
    <img
      src={getBrandAsset(asset)}
      alt={alt}
      className={cn(className)}
      draggable={false}
    />
  );
}
