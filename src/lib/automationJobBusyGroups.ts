import type { AutomationJobRecord } from '@/types/automationJob';

/** Group IDs already queued/running on a job (batch `groups[]` or legacy single group). */
export function automationJobBusyGroupIds(job: AutomationJobRecord): string[] {
  const fromBatch = job.payload.groups
    ?.map((group) => group.groupId.trim())
    .filter(Boolean);
  if (fromBatch?.length) return fromBatch;

  const single = job.payload.groupId?.trim();
  return single ? [single] : [];
}

export function automationJobBusyGroupIdSet(
  jobs: AutomationJobRecord[],
  filter: (job: AutomationJobRecord) => boolean,
): Set<string> {
  const busy = new Set<string>();
  for (const job of jobs) {
    if (!filter(job)) continue;
    for (const groupId of automationJobBusyGroupIds(job)) {
      busy.add(groupId);
    }
  }
  return busy;
}
