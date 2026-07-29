import { app, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const BRAND_PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const;

export function getBrandGroupPhotosDir(): string {
  return path.join(app.getPath('userData'), 'brand-group-photos');
}

function resolveBrandPhotoStorageDir(brandName: string): string {
  const base = sanitizeBrandPhotoBaseName(brandName);
  const root = getBrandGroupPhotosDir();
  const direct = path.join(root, base);
  if (fs.existsSync(direct)) return direct;
  if (process.platform === 'win32' && fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.toLowerCase() === base.toLowerCase()) {
        return path.join(root, entry.name);
      }
    }
  }
  return direct;
}

export function getBrandPhotoStorageDir(brandName: string): string {
  return resolveBrandPhotoStorageDir(brandName);
}

export type BrandGroupPhotoEntry = {
  path: string;
  fileName: string;
  savedAt: string;
};

function isBrandPhotoFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return BRAND_PHOTO_EXTENSIONS.includes(ext as (typeof BRAND_PHOTO_EXTENSIONS)[number]);
}

function pushPhotoEntry(
  entries: BrandGroupPhotoEntry[],
  fullPath: string,
  displayFileName: string,
): void {
  if (!fs.existsSync(fullPath)) return;
  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) return;
  entries.push({
    path: fullPath,
    fileName: displayFileName,
    savedAt: stat.mtime.toISOString(),
  });
}

/** Kumpulkan semua foto brand — root (jpg/png/jpeg) + folder brand (legacy timestamp). */
function collectBrandPhotoCandidates(
  brandName: string,
  displayFileName: string,
): BrandGroupPhotoEntry[] {
  const base = sanitizeBrandPhotoBaseName(brandName);
  const rootDir = getBrandGroupPhotosDir();
  const entries: BrandGroupPhotoEntry[] = [];
  if (!fs.existsSync(rootDir)) return entries;

  for (const file of fs.readdirSync(rootDir)) {
    if (!isBrandPhotoFile(file)) continue;
    const stem = path.basename(file, path.extname(file));
    if (stem.toLowerCase() !== base.toLowerCase()) continue;
    pushPhotoEntry(entries, path.join(rootDir, file), displayFileName);
  }

  const brandDir = resolveBrandPhotoStorageDir(brandName);
  if (fs.existsSync(brandDir) && fs.statSync(brandDir).isDirectory()) {
    for (const file of fs.readdirSync(brandDir)) {
      if (!isBrandPhotoFile(file)) continue;
      pushPhotoEntry(entries, path.join(brandDir, file), displayFileName);
    }
  }

  return entries;
}

/** Satu foto terbaru per brand — termasuk legacy sebelum migrasi ke {brand}.jpg. */
export function listBrandGroupPhotoFiles(brandName: string): BrandGroupPhotoEntry[] {
  const displayFileName = expectedBrandGroupPhotoFileName(brandName);
  const entries = collectBrandPhotoCandidates(brandName, displayFileName);
  if (entries.length === 0) return [];

  entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return [entries[0]];
}

export function sanitizeBrandPhotoBaseName(brandName: string): string {
  const trimmed = brandName.trim();
  const safe = trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, '_');
  return safe || 'brand';
}

export function resolveBrandGroupPhotoPath(brandName: string): string | null {
  const latest = listBrandGroupPhotoFiles(brandName)[0];
  return latest?.path ?? null;
}

/**
 * Build public URL untuk foto brand di Supabase Storage.
 * Pattern: {SUPABASE_URL}/storage/v1/object/public/brand-group-photos/{userId}/{brand}.jpg
 */
export function buildBrandPhotoPublicUrl(userId: string, brandName: string): string | null {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl) return null;
  const safe = sanitizeBrandPhotoBaseName(brandName);
  return `${supabaseUrl}/storage/v1/object/public/brand-group-photos/${userId}/${safe}.jpg`;
}

/**
 * Download foto dari Supabase public URL → simpan ke local cache.
 * Dipakai worker saat file lokal belum ada.
 */
export async function downloadAndCacheBrandPhoto(
  brandName: string,
  publicUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(publicUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    const dir = getBrandGroupPhotosDir();
    fs.mkdirSync(dir, { recursive: true });
    const base = sanitizeBrandPhotoBaseName(brandName);
    const dest = path.join(dir, `${base}.jpg`);
    fs.writeFileSync(dest, buffer);
    return dest;
  } catch {
    return null;
  }
}

/**
 * Resolve foto brand: lokal dulu → fallback download dari Supabase.
 * Untuk worker yang butuh path file lokal.
 */
export async function resolveBrandPhotoWithFallback(
  brandName: string,
  userId?: string,
): Promise<string | null> {
  const local = resolveBrandGroupPhotoPath(brandName);
  if (local) return local;

  if (!userId) return null;
  const url = buildBrandPhotoPublicUrl(userId, brandName);
  if (!url) return null;

  return downloadAndCacheBrandPhoto(brandName, url);
}

export function expectedBrandGroupPhotoFileName(brandName: string): string {
  return `${sanitizeBrandPhotoBaseName(brandName)}.jpg`;
}

function readPhotoDataUrl(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' : ext === '.jpeg' || ext === '.jpg' ? 'image/jpeg' : 'image/jpeg';
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function pickAndSaveBrandGroupPhoto(brandName: string): Promise<{
  ok: boolean;
  path?: string;
  dataUrl?: string;
  error?: string;
}> {
  const trimmed = brandName.trim();
  if (!trimmed) return { ok: false, error: 'BRAND_REQUIRED' };

  const picked = await dialog.showOpenDialog({
    title: 'Select brand group photo',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png'] },
    ],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return { ok: false, error: 'CANCELLED' };
  }

  const source = picked.filePaths[0];
  const ext = path.extname(source).toLowerCase();
  if (!BRAND_PHOTO_EXTENSIONS.includes(ext as (typeof BRAND_PHOTO_EXTENSIONS)[number])) {
    return { ok: false, error: 'INVALID_FORMAT' };
  }

  const dir = getBrandGroupPhotosDir();
  fs.mkdirSync(dir, { recursive: true });
  const base = sanitizeBrandPhotoBaseName(trimmed);
  const dest = path.join(dir, `${base}.jpg`);

  purgeBrandGroupPhotoFiles(trimmed);

  try {
    fs.copyFileSync(source, dest);
    const dataUrl = readPhotoDataUrl(dest) ?? undefined;
    return { ok: true, path: dest, dataUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'COPY_FAILED';
    return { ok: false, error: message };
  }
}

/** Hapus semua foto lama brand — upload baru menimpa (satu file canonical). */
function purgeBrandGroupPhotoFiles(brandName: string): void {
  const base = sanitizeBrandPhotoBaseName(brandName);
  const rootDir = getBrandGroupPhotosDir();

  const brandDir = resolveBrandPhotoStorageDir(brandName);
  if (fs.existsSync(brandDir)) {
    for (const file of fs.readdirSync(brandDir)) {
      const full = path.join(brandDir, file);
      try {
        if (fs.statSync(full).isFile()) fs.unlinkSync(full);
      } catch {
        // ignore
      }
    }
    try {
      fs.rmdirSync(brandDir);
    } catch {
      // ignore
    }
  }

  for (const file of fs.readdirSync(rootDir)) {
    if (!isBrandPhotoFile(file)) continue;
    const stem = path.basename(file, path.extname(file));
    if (stem.toLowerCase() !== base.toLowerCase()) continue;
    try {
      fs.unlinkSync(path.join(rootDir, file));
    } catch {
      // ignore
    }
  }
}

export function registerBrandGroupPhotoIpc(): void {
  ipcMain.handle('brandGroupPhoto:resolve', (_event, brandName: string) => {
    const photoPath = resolveBrandGroupPhotoPath(String(brandName ?? ''));
    if (!photoPath) {
      return {
        ok: false as const,
        expectedFileName: expectedBrandGroupPhotoFileName(String(brandName ?? '')),
        dir: getBrandGroupPhotosDir(),
      };
    }
    return { ok: true as const, path: photoPath };
  });

  ipcMain.handle('brandGroupPhoto:pickAndSave', async (_event, brandName: string) => {
    return pickAndSaveBrandGroupPhoto(String(brandName ?? ''));
  });

  ipcMain.handle('brandGroupPhoto:list', (_event, brandName: string) => {
    const photos = listBrandGroupPhotoFiles(String(brandName ?? ''));
    return { ok: true as const, photos };
  });

  ipcMain.handle('brandGroupPhoto:previewUrl', (_event, filePath: string) => {
    const trimmed = String(filePath ?? '').trim();
    if (!trimmed || !fs.existsSync(trimmed)) {
      return { ok: false as const };
    }
    const dataUrl = readPhotoDataUrl(trimmed);
    if (!dataUrl) {
      return { ok: false as const };
    }
    return { ok: true as const, dataUrl };
  });

  ipcMain.handle('brandGroupPhoto:saveBlob', (_event, brandName: string, base64Data: string) => {
    const trimmed = String(brandName ?? '').trim();
    if (!trimmed || !base64Data) return { ok: false as const };

    const dir = getBrandGroupPhotosDir();
    fs.mkdirSync(dir, { recursive: true });
    const base = sanitizeBrandPhotoBaseName(trimmed);
    const dest = path.join(dir, `${base}.jpg`);

    try {
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(dest, buffer);
      return { ok: true as const, path: dest };
    } catch {
      return { ok: false as const };
    }
  });
}
