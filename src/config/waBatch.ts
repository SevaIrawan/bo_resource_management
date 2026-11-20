/**
 * Batch akun WhatsApp — kolom `messaging_accounts.wa_batch` (migrasi 043).
 *
 * - `A`..`ZZ` = akun batch: hanya dibandingkan dengan grup master berlabel batch itu.
 * - `FULL`    = Full Group: dibandingkan dengan seluruh master brand.
 * - `OLD`     = akun lama sebelum 043 — perilaku sama dengan FULL, hanya nama berbeda.
 * - `null`    = akun dibuat app lama setelah 043 → diperlakukan seperti OLD.
 * Akun Telegram selalu `null` (constraint DB).
 */
export const WA_BATCH_FULL = 'FULL';
export const WA_BATCH_OLD = 'OLD';

const BATCH_LETTER_RE = /^[A-Z]{1,2}$/;

/** Nilai valid (huruf besar) atau null. */
export function normalizeWaBatch(value: unknown): string | null {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!raw) return null;
  if (raw === WA_BATCH_FULL || raw === WA_BATCH_OLD) return raw;
  return BATCH_LETTER_RE.test(raw) ? raw : null;
}

/** True untuk batch huruf A..ZZ (bukan FULL / OLD / null). */
export function isWaBatchLetter(value: unknown): boolean {
  const v = normalizeWaBatch(value);
  return v != null && BATCH_LETTER_RE.test(v);
}

/** Batch efektif untuk tampilan/aturan: null → OLD. */
export function effectiveWaBatch(value: unknown): string {
  return normalizeWaBatch(value) ?? WA_BATCH_OLD;
}

/** A→0, Z→25, AA→26 — urutan sama dengan rm_batch_index (043). */
export function waBatchIndex(batch: string): number {
  let n = 0;
  for (const ch of batch) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}
