import { computeAccountTicketBreakdown } from '@/lib/accountMasterDailyCompare';

export interface TicketGapStats {
  dailyY: number;
  masterX: number;
  junk: number;
  missing: number;
  gapYMinusX: number;
}

/** Hitung gap ticket dari baris master + daily (logic sama grid & reconcile). */
export function computeTicketGapStats(
  masterRows: { group_id: string | null | undefined; group_name?: string | null; invite_link?: string | null }[],
  dailyRows: {
    group_id: string | null | undefined;
    group_name?: string | null;
    invite_link?: string | null;
    is_admin?: string;
  }[],
): TicketGapStats {
  const b = computeAccountTicketBreakdown(
    masterRows.map((m) => ({
      group_id: String(m.group_id ?? '').trim(),
      group_name: m.group_name ?? null,
      invite_link: m.invite_link ?? null,
    })),
    dailyRows.map((d) => ({
      group_id: String(d.group_id ?? '').trim(),
      group_name: d.group_name ?? null,
      invite_link: d.invite_link ?? null,
      is_admin: d.is_admin,
    })),
  );
  return {
    dailyY: b.dailyY,
    masterX: b.masterX,
    junk: b.junk.length,
    missing: b.missing.length,
    gapYMinusX: b.dailyY - b.masterX,
  };
}
