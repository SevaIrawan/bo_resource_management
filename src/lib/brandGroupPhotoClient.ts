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
