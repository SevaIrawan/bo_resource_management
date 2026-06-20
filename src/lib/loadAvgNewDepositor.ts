import { TABLES } from '@/config/tables';
import {
  DEFAULT_AVG_ND_WINDOW_DAYS,
  readAvgNdWindowDaysForBrand,
} from '@/config/operationsStockPolicy';
import { getSupabase } from '@/lib/supabase';

/** Default window Avg ND (hari) — override per brand via Admin policy. */
export { DEFAULT_AVG_ND_WINDOW_DAYS as AVG_ND_WINDOW_DAYS } from '@/config/operationsStockPolicy';

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function avgNdWindowBounds(
  windowDays: number = DEFAULT_AVG_ND_WINDOW_DAYS,
  referenceDate: Date = new Date(),
): { startDate: string; endDate: string } {
  const days = Math.max(1, Math.floor(windowDays));
  const end = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()),
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: formatUtcDate(start), endDate: formatUtcDate(end) };
}

/**
 * Avg ND per brand = SUM(new_depositor) dalam window hari ÷ window hari.
 * Window hari per brand dari Admin policy (default 30).
 */
export async function loadAvgNewDepositorByLine(
  brandNames: string[],
  referenceDate: Date = new Date(),
): Promise<Map<string, number>> {
  const supabase = getSupabase();
  const lines = [...new Set(brandNames.map((name) => name.trim()).filter(Boolean))];
  const result = new Map<string, number>();
  if (!supabase || lines.length === 0) return result;

  const windowByLine = new Map(
    lines.map((line) => [line, readAvgNdWindowDaysForBrand(line)] as const),
  );
  const maxWindow = Math.max(...lines.map((line) => windowByLine.get(line) ?? DEFAULT_AVG_ND_WINDOW_DAYS));
  const { startDate, endDate } = avgNdWindowBounds(maxWindow, referenceDate);

  const { data, error } = await supabase
    .from(TABLES.newRegister)
    .select('line, date, new_depositor')
    .in('line', lines)
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) throw error;

  const sumByLineDate = new Map<string, number>();
  for (const row of data ?? []) {
    const line = String(row.line ?? '').trim();
    const date = String(row.date ?? '').trim();
    if (!line || !date) continue;
    const key = `${line}\u0000${date}`;
    const nd = Math.max(0, Number(row.new_depositor) || 0);
    sumByLineDate.set(key, (sumByLineDate.get(key) ?? 0) + nd);
  }

  for (const line of lines) {
    const windowDays = windowByLine.get(line) ?? DEFAULT_AVG_ND_WINDOW_DAYS;
    const { startDate: lineStart } = avgNdWindowBounds(windowDays, referenceDate);
    let sum = 0;
    for (const [key, dayTotal] of sumByLineDate) {
      const [keyLine, date] = key.split('\u0000');
      if (keyLine !== line || !date || date < lineStart) continue;
      sum += dayTotal;
    }
    result.set(line, sum / windowDays);
  }

  return result;
}

export function readAvgNewDepositor(
  averages: Map<string, number>,
  brandName: string,
): number | null {
  const key = brandName.trim();
  if (!key) return null;
  const value = averages.get(key);
  return value == null || !Number.isFinite(value) ? null : value;
}
