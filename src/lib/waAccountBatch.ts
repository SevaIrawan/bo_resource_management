import { TABLES } from '@/config/tables';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';

const WA_BATCH_LETTER = /^[A-Z]{1,2}$/;
const WA_BATCH_TOKEN = /^[A-Za-z0-9](?:[A-Za-z0-9 _-]{0,31})$/;

/** Huruf batch A..ZZ. Dipakai mesin isi slot baru, bukan identitas yang dikunci selamanya. */
export function waBatchLetter(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  return WA_BATCH_LETTER.test(raw) ? raw : null;
}

/** Nama batch yang tersimpan. Huruf A/B/C atau nama pengganti. OLD bukan batch New Acc. */
export function waBatchToken(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!raw || raw.length > 32 || /^old$/i.test(raw)) return null;
  return WA_BATCH_TOKEN.test(raw) ? raw : null;
}

/** Indeks A=0 … ZZ=701. Dipakai hanya untuk mengurutkan pilihan di form. */
export function waBatchIndex(batch: string): number {
  let index = 0;
  for (const char of batch) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * New Acc (huruf) hanya melihat grup batch-nya.
 * Old Acc (OLD / NULL) dan Telegram mengembalikan null = tanpa filter.
 */
export function accountSeesOnlyBatch(
  platform: string,
  waBatch: string | null | undefined,
): string | null {
  if (platform !== 'whatsapp') return null;
  return waBatchToken(waBatch);
}

export function groupVisibleInBatch(
  groupBatch: string | null | undefined,
  onlyBatch: string | null,
): boolean {
  if (!onlyBatch) return true;
  return waBatchToken(groupBatch) === onlyBatch;
}

/** Link disembunyikan bila New Acc dan batch grup bukan batch akun. */
export function inviteLinkForBatch(
  inviteLink: string | null | undefined,
  groupBatch: string | null | undefined,
  onlyBatch: string | null,
): string {
  const link = String(inviteLink ?? '').trim();
  if (!onlyBatch) return link;
  return waBatchToken(groupBatch) === onlyBatch ? link : '';
}

/** Huruf tetap tampil sebelum scrape. Old Acc baru "-"; setelah scrape "Old Acc". */
export function whatsAppBatchLabel(input: {
  waBatch: string | null | undefined;
  scrapedOnce: boolean;
  oldLabel: string;
}): string {
  const token = waBatchToken(input.waBatch);
  if (token) return token;
  return input.scrapedOnce ? input.oldLabel : '-';
}

/** Kolom yang ditulis saat Add / reaktivasi WhatsApp. Telegram tidak menyentuh kolom ini. */
export function waAccountBatchColumns(
  platform: string,
  waBatch: string | null | undefined,
): { wa_batch: string; wa_batch_locked: boolean } | Record<string, never> {
  if (platform !== 'whatsapp') return {};
  return {
    wa_batch: waBatchToken(waBatch) ?? 'OLD',
    wa_batch_locked: false,
  };
}

/** Huruf yang sudah dipakai label active/missing brand ini. */
export async function listBrandWaBatchLetters(brandName: string): Promise<string[]> {
  const brand = brandName.trim();
  if (!brand) return [];

  const filters = (status: 'active' | 'missing') => [
    { column: 'brand', value: brand },
    { column: 'platform', value: 'whatsapp' },
    { column: 'status', value: status },
  ];

  const [active, missing] = await Promise.all([
    fetchAllSupabaseRows<{ batch: string }>(TABLES.groupBatchLabels, 'batch', filters('active')),
    fetchAllSupabaseRows<{ batch: string }>(TABLES.groupBatchLabels, 'batch', filters('missing')),
  ]);

  const letters = new Set<string>();
  for (const row of [...active, ...missing]) {
    const token = waBatchToken(row.batch);
    if (token) letters.add(token);
  }
  return [...letters].sort((a, b) => {
    const aLetter = waBatchLetter(a);
    const bLetter = waBatchLetter(b);
    if (aLetter && bLetter) return waBatchIndex(aLetter) - waBatchIndex(bLetter);
    if (aLetter) return -1;
    if (bLetter) return 1;
    return a.localeCompare(b);
  });
}
