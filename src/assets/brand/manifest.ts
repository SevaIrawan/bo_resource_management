/**
 * Daftar file logo — taruh file di `public/brand/`
 * Support: .svg .png .jpg .jpeg .webp .gif .avif .ico .bmp
 */
export const BRAND_FILES = {
  logo: 'logo-icon.jpg',
  logoFull: 'logo-full.svg',
  telegram: 'telegram.svg',
  whatsapp: 'whatsapp.svg',
  flagMy: 'MY.png',
} as const;

export type BrandAssetKey = keyof typeof BRAND_FILES;

/** Folder publik untuk semua logo (drop file baru di sini). */
export const BRAND_PUBLIC_DIR = 'brand';
