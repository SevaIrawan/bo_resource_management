import type { AutomationJobPayload } from '@/types/automationJob';

/** Legacy jobs (before useGroupNumbering) kept numbered batches when total > 1. */
export function createGroupBatchUsesNumbering(
  payload: Pick<AutomationJobPayload, 'useGroupNumbering' | 'totalToCreate'>,
  total: number,
): boolean {
  if (payload.useGroupNumbering === true) return true;
  if (payload.useGroupNumbering === false) return false;
  return total > 1;
}
