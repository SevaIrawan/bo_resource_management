/** Ambil pesan error asli — Supabase PostgrestError sering bukan instanceof Error. */
export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as { message?: string; details?: string; hint?: string; code?: string };
    if (record.message) {
      const parts = [record.message];
      if (record.details) parts.push(record.details);
      if (record.hint) parts.push(record.hint);
      if (record.code) parts.push(`(${record.code})`);
      return parts.join(' — ');
    }
  }
  return fallback;
}
