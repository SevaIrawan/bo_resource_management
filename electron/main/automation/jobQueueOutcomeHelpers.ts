import type { AutomationJobRecord } from './jobQueueTypes';

export type JobGroupOutcome = NonNullable<
  AutomationJobRecord['payload']['groupOutcomes']
>[number];

export function countCreatedGroupOutcomes(
  outcomes: AutomationJobRecord['payload']['groupOutcomes'] | undefined,
): number {
  if (!outcomes?.length) return 0;
  return outcomes.filter((row) => row.createStatus === 'created' && String(row.groupId ?? '').trim()).length;
}

export function mergeJobGroupOutcomes(
  existing: AutomationJobRecord['payload']['groupOutcomes'] | undefined,
  incoming: AutomationJobRecord['payload']['groupOutcomes'] | undefined,
): JobGroupOutcome[] | undefined {
  if (!incoming?.length && !existing?.length) return undefined;
  const map = new Map<string, JobGroupOutcome>();
  const push = (row: JobGroupOutcome) => {
    const masterId = String(row.expectedGroupId ?? '').trim();
    const id = String(row.groupId ?? '').trim();
    const key =
      masterId ||
      id ||
      `name:${String(row.groupName ?? '').trim()}:${row.createStatus ?? row.joinStatus ?? row.adminStatus ?? ''}`;
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, ...row } : { ...row });
  };
  for (const row of existing ?? []) push(row);
  for (const row of incoming ?? []) push(row);
  return [...map.values()];
}

/** Resume create: sisa target + startFrom lanjut (anti duplikat nomor/nama). */
export function resolveCreateResumeSlice(job: AutomationJobRecord): {
  alreadyCreated: number;
  remaining: number;
  startFrom: number;
  originalTotal: number;
} {
  const originalTotal = Math.max(1, Math.floor(Number(job.payload.totalToCreate) || 1));
  const alreadyCreated = countCreatedGroupOutcomes(job.payload.groupOutcomes);
  const remaining = Math.max(0, originalTotal - alreadyCreated);
  const baseStart = Math.max(1, Math.floor(Number(job.payload.startFrom) || 1));
  return {
    alreadyCreated,
    remaining,
    startFrom: baseStart + alreadyCreated,
    originalTotal,
  };
}

export function filterGroupsNotDone(
  groups: Array<{ groupId: string; groupName?: string; inviteLink?: string; groupLink?: string }>,
  outcomes: AutomationJobRecord['payload']['groupOutcomes'] | undefined,
  kind: 'join' | 'set_admin' | 'set_group_photo' | 'leave',
): typeof groups {
  if (!groups.length || !outcomes?.length) return groups;
  const done = new Set<string>();
  for (const row of outcomes) {
    const masterId = String(row.expectedGroupId ?? '').trim();
    const deviceId = String(row.groupId ?? '').trim();
    if (kind === 'join' && (row.joinStatus === 'joined' || row.joinStatus === 'already_member')) {
      if (masterId) done.add(masterId);
      if (deviceId) done.add(deviceId);
    }
    if (kind === 'set_admin' && row.adminStatus === 'promoted') {
      if (masterId) done.add(masterId);
      if (deviceId) done.add(deviceId);
    }
    if (kind === 'set_group_photo' && row.photoStatus === 'set') {
      if (deviceId) done.add(deviceId);
    }
    if (kind === 'leave' && (row.exitStatus === 'left' || row.deleteStatus === 'deleted')) {
      if (masterId) done.add(masterId);
      if (deviceId) done.add(deviceId);
    }
  }
  if (done.size === 0) return groups;
  return groups.filter((g) => !done.has(String(g.groupId ?? '').trim()));
}
