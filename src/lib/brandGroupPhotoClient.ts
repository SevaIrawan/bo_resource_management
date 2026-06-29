export type BrandGroupPhotoEntry = {
  path: string;
  fileName: string;
  savedAt: string;
};

/** Selaras electron/main/brandGroupPhoto.ts — huruf besar/kecil brand dipertahankan. */
export function brandGroupPhotoFileBase(brandName: string): string {
  const trimmed = brandName.trim();
  const safe = trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, '_');
  return safe || 'brand';
}

/** Format wajib: [brand].jpg — ekstensi selalu .jpg (huruf kecil). */
export function expectedBrandGroupPhotoFileName(brandName: string): string {
  return `${brandGroupPhotoFileBase(brandName)}.jpg`;
}

export async function listBrandGroupPhotos(
  brandName: string,
): Promise<BrandGroupPhotoEntry[]> {
  const api = window.electronAPI?.brandGroupPhoto?.list;
  if (!api) return [];
  const result = await api(brandName);
  if (!result.ok || !result.photos?.length) return [];
  return result.photos;
}

export async function resolveBrandGroupPhotoPath(
  brandName: string,
): Promise<{ ok: true; path: string } | { ok: false; expectedFileName?: string; dir?: string }> {
  const api = window.electronAPI?.brandGroupPhoto?.resolve;
  if (!api) return { ok: false };
  const result = await api(brandName);
  if (result.ok && result.path) return { ok: true, path: result.path };
  return {
    ok: false,
    expectedFileName: result.expectedFileName,
    dir: result.dir,
  };
}

export async function pickAndSaveBrandGroupPhoto(
  brandName: string,
): Promise<{ ok: true; path: string; dataUrl?: string } | { ok: false; error?: string }> {
  const api = window.electronAPI?.brandGroupPhoto?.pickAndSave;
  if (!api) return { ok: false, error: 'DESKTOP_REQUIRED' };
  const result = await api(brandName);
  if (result.ok && result.path) {
    return { ok: true, path: result.path, dataUrl: result.dataUrl };
  }
  return { ok: false, error: result.error };
}

export async function brandGroupPhotoPreviewUrl(
  filePath: string,
): Promise<string | null> {
  const api = window.electronAPI?.brandGroupPhoto?.previewUrl;
  if (!api) return null;
  const result = await api(filePath);
  if (result.ok && result.dataUrl) return result.dataUrl;
  return null;
}
