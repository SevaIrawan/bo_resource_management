import { app, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const BRAND_PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const;

export function getBrandGroupPhotosDir(): string {
  return path.join(app.getPath('userData'), 'brand-group-photos');
}

export function sanitizeBrandPhotoBaseName(brandName: string): string {
  const trimmed = brandName.trim();
  const safe = trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, '_');
  return safe || 'brand';
}

export function resolveBrandGroupPhotoPath(brandName: string): string | null {
  const base = sanitizeBrandPhotoBaseName(brandName);
  const dir = getBrandGroupPhotosDir();
  for (const ext of BRAND_PHOTO_EXTENSIONS) {
    const candidate = path.join(dir, `${base}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
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
  for (const oldExt of BRAND_PHOTO_EXTENSIONS) {
    const oldPath = path.join(dir, `${base}${oldExt}`);
    if (fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch {
        // ignore — overwrite below
      }
    }
  }

  const dest = path.join(dir, `${base}${ext}`);
  try {
    fs.copyFileSync(source, dest);
    const dataUrl = readPhotoDataUrl(dest) ?? undefined;
    return { ok: true, path: dest, dataUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'COPY_FAILED';
    return { ok: false, error: message };
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
}
