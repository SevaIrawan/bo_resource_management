import { getSupabase } from '@/lib/supabase';

const BUCKET = 'brand-group-photos';

function storagePath(userId: string, brandName: string): string {
  const safe = brandName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${userId}/${safe}.jpg`;
}

export async function resolveCurrentUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Upload foto brand ke Supabase Storage (upsert — replace jika sudah ada).
 * Ini adalah satu-satunya sumber kebenaran.
 */
export async function uploadBrandGroupPhoto(
  userId: string,
  brandName: string,
  fileBlob: Blob,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'SUPABASE_NOT_CONFIGURED' };

  const filePath = storagePath(userId, brandName);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, fileBlob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) return { ok: false, error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  const url = data?.publicUrl ?? '';
  return { ok: true, url };
}

/**
 * Public URL foto brand — bisa diakses oleh semua installer tanpa auth.
 */
export function getBrandGroupPhotoPublicUrl(
  userId: string,
  brandName: string,
): string | null {
  const supabase = getSupabase();
  if (!supabase) return null;

  const filePath = storagePath(userId, brandName);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data?.publicUrl ?? null;
}

/**
 * Download blob foto dari Supabase Storage.
 */
export async function downloadBrandGroupPhoto(
  userId: string,
  brandName: string,
): Promise<Blob | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const filePath = storagePath(userId, brandName);

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(filePath);

  if (error || !data) return null;
  return data;
}

/**
 * Cek apakah foto brand ada di Supabase (HEAD request ke public URL).
 */
export async function brandGroupPhotoExistsInStorage(
  userId: string,
  brandName: string,
): Promise<boolean> {
  const url = getBrandGroupPhotoPublicUrl(userId, brandName);
  if (!url) return false;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}
