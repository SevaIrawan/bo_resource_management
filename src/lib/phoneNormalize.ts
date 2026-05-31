/** Normalize phone to digits-only for DB matching */
export function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function phonesMatch(a: string, b: string): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}
