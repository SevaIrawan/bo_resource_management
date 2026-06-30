import type { AutomationRunPayload } from './types';

/** Legacy jobs (before useGroupNumbering) kept numbered batches when total > 1. */
export function createGroupBatchUsesNumbering(
  payload: Pick<AutomationRunPayload, 'useGroupNumbering' | 'totalToCreate'>,
  totalTarget: number,
): boolean {
  if (payload.useGroupNumbering === true) return true;
  if (payload.useGroupNumbering === false) return false;
  return totalTarget > 1;
}

export function resolveCreateBatchGroupName(
  prefix: string,
  num: number,
  totalTarget: number,
  useNumbering: boolean,
): string {
  return useNumbering && totalTarget > 1 ? `${prefix} ${num}`.trim() : prefix;
}
