import { TABLES } from '@/config/tables';
import { waBatchIndex } from '@/config/waBatch';
import { fetchAllSupabaseRows } from '@/lib/supabasePagedSelect';

export interface WaBatchSummary {
  batch: string;
  /** Grup berstatus active di batch ini. */
  active: number;
  /** Grup missing (slot masih dipegang). */
  missing: number;
}

type LabelRow = { group_id: string; batch: string; status: string };

/**
 * Batch label grup WA yang ada di brand (status active/missing), urut A, B, … AA.
 * Sumber: resource_management_group_batch_labels (migrasi 043, read-only untuk app).
 */
export async function fetchBrandWaBatchSummary(brandName: string): Promise<WaBatchSummary[]> {
  const brand = brandName.trim();
  if (!brand) return [];

  const rows = await fetchAllSupabaseRows<LabelRow>(
    TABLES.groupBatchLabels,
    'group_id, batch, status',
    [
      { column: 'brand', value: brand },
      { column: 'platform', value: 'whatsapp' },
    ],
  );

  const byBatch = new Map<string, WaBatchSummary>();
  for (const row of rows) {
    const batch = String(row.batch ?? '').trim();
    if (!batch) continue;
    if (row.status !== 'active' && row.status !== 'missing') continue;
    const entry = byBatch.get(batch) ?? { batch, active: 0, missing: 0 };
    if (row.status === 'active') entry.active += 1;
    else entry.missing += 1;
    byBatch.set(batch, entry);
  }

  return [...byBatch.values()].sort((a, b) => waBatchIndex(a.batch) - waBatchIndex(b.batch));
}
