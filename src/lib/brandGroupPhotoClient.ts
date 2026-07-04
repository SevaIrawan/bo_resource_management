import {
  uploadBrandGroupPhoto,
  getBrandGroupPhotoPublicUrl,
  downloadBrandGroupPhoto,
  brandGroupPhotoExistsInStorage,
  resolveCurrentUserId,
} from '@/lib/brandGroupPhotoStorage';

export type BrandGroupPhotoEntry = {
  path: string;
  fileName: string;
  savedAt: string;
};

export function brandGroupPhotoFileBase(brandName: string): string {
  const trimmed = brandName.trim();
  const safe = trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, '_');
  return safe || 'brand';
}

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

/**
 * Resolve photo — Supabase = sumber kebenaran.
 * 1. Cek Supabase ada foto → return public URL
 * 2. Fallback local disk (legacy/cache)
 */
export async function resolveBrandGroupPhotoPath(
  brandName: string,
  userId?: string,
): Promise<{ ok: true; path: string } | { ok: false; expectedFileName?: string; dir?: string }> {
  const uid = userId ?? await resolveCurrentUserId();

  if (uid) {
    const exists = await brandGroupPhotoExistsInStorage(uid, brandName);
    if (exists) {
      const url = getBrandGroupPhotoPublicUrl(uid, brandName);
      if (url) return { ok: true, path: url };
    }
  }

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

/**
 * Pick file via Electron dialog → simpan lokal + upload ke Supabase (realtime, replace lama).
 * Supabase = single source of truth; lokal = cache identik.
 */
export async function pickAndSaveBrandGroupPhoto(
  brandName: string,
  userId?: string,
): Promise<{ ok: true; path: string; dataUrl?: string } | { ok: false; error?: string }> {
  const api = window.electronAPI?.brandGroupPhoto?.pickAndSave;
  if (!api) return { ok: false, error: 'DESKTOP_REQUIRED' };

  const result = await api(brandName);
  if (!result.ok || !result.path) {
    return { ok: false, error: result.error };
  }

  const uid = userId ?? await resolveCurrentUserId();
  if (uid && result.path) {
    const blob = await readLocalFileAsBlob(result.path);
    if (blob) {
      await uploadBrandGroupPhoto(uid, brandName, blob);
    }
  }

  return { ok: true, path: result.path, dataUrl: result.dataUrl };
}

async function readLocalFileAsBlob(filePath: string): Promise<Blob | null> {
  const previewApi = window.electronAPI?.brandGroupPhoto?.previewUrl;
  if (!previewApi) return null;
  const res = await previewApi(filePath);
  if (!res.ok || !res.dataUrl) return null;
  const response = await fetch(res.dataUrl);
  return response.blob();
}

/**
 * Preview URL untuk UI.
 * - Jika path = http URL (Supabase) → return langsung
 * - Jika path = local file → baca via Electron IPC
 */
export async function brandGroupPhotoPreviewUrl(
  filePath: string,
  _userId?: string,
  _brandName?: string,
): Promise<string | null> {
  if (filePath.startsWith('http')) {
    return filePath;
  }

  const api = window.electronAPI?.brandGroupPhoto?.previewUrl;
  if (!api) return null;
  const result = await api(filePath);
  if (result.ok && result.dataUrl) return result.dataUrl;
  return null;
}

/**
 * Ensure foto ada di lokal (untuk worker yang butuh file path).
 * Jika lokal tidak ada → download dari Supabase → simpan ke lokal.
 */
export async function ensureLocalBrandGroupPhoto(
  brandName: string,
  userId?: string,
): Promise<string | null> {
  const api = window.electronAPI?.brandGroupPhoto?.resolve;
  if (api) {
    const local = await api(brandName);
    if (local.ok && local.path) return local.path;
  }

  const uid = userId ?? await resolveCurrentUserId();
  if (!uid) return null;

  const blob = await downloadBrandGroupPhoto(uid, brandName);
  if (!blob) return null;

  const saveApi = window.electronAPI?.brandGroupPhoto?.saveBlob;
  if (!saveApi) return null;
  const saved = await saveApi(brandName, await blobToBase64(blob));
  return saved.ok ? saved.path ?? null : null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
