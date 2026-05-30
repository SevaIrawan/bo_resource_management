import { BRAND_FILES, BRAND_PUBLIC_DIR, type BrandAssetKey } from './manifest';

export function getBrandAsset(key: BrandAssetKey): string {
  const filename = BRAND_FILES[key];

  if (typeof window !== 'undefined') {
    return new URL(`${BRAND_PUBLIC_DIR}/${filename}`, window.location.href).href;
  }

  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  return `${base}${BRAND_PUBLIC_DIR}/${filename}`;
}

export { BRAND_FILES, BRAND_PUBLIC_DIR, type BrandAssetKey } from './manifest';

export const SUPPORTED_BRAND_EXTENSIONS = [
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.ico',
  '.bmp',
] as const;
