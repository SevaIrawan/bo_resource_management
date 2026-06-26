import type { AutomationJobRecord } from './jobQueueTypes';
import type { AutomationRunPayload } from './types';

export function resolveJoinGroups(
  payload: Pick<AutomationRunPayload, 'groups' | 'groupId' | 'groupName' | 'inviteLink'>,
): Array<{ groupId: string; groupName?: string; inviteLink: string }> {
  if (payload.groups?.length) {
    return payload.groups
      .map((row) => ({
        groupId: row.groupId?.trim() ?? '',
        groupName: row.groupName,
        inviteLink: row.inviteLink?.trim() ?? '',
      }))
      .filter((row) => row.groupId && row.inviteLink);
  }
  const inviteLink = payload.inviteLink?.trim() ?? '';
  if (!inviteLink) return [];
  return [
    {
      groupId: payload.groupId?.trim() ?? '',
      groupName: payload.groupName,
      inviteLink,
    },
  ];
}

export function resolveLeaveDeleteGroups(
  payload: Pick<AutomationRunPayload, 'groups' | 'groupId' | 'groupName' | 'groupLink'>,
): Array<{ groupId: string; groupName?: string; groupLink?: string }> {
  return resolveSetAdminGroups(payload);
}

export function resolveSetAdminGroups(
  payload: Pick<AutomationRunPayload, 'groups' | 'groupId' | 'groupName' | 'groupLink'>,
): Array<{ groupId: string; groupName?: string; groupLink?: string }> {
  if (payload.groups?.length) {
    return payload.groups
      .map((row) => ({
        groupId: row.groupId?.trim() ?? '',
        groupName: row.groupName,
        groupLink: row.groupLink?.trim() || undefined,
      }))
      .filter((row) => row.groupId);
  }
  const groupId = payload.groupId?.trim() ?? '';
  if (!groupId) return [];
  return [
    {
      groupId,
      groupName: payload.groupName,
      groupLink: payload.groupLink?.trim() || undefined,
    },
  ];
}

export function accountJobStepTotal(job: AutomationJobRecord): number {
  if (job.action === 'create_group') {
    return Math.max(1, Math.floor(Number(job.payload.totalToCreate) || 1));
  }
  if (job.action === 'join_by_invite_link') {
    const fromGroups = job.payload.groups?.length ?? 0;
    if (fromGroups > 0) return fromGroups;
    return job.payload.inviteLink?.trim() ? 1 : 0;
  }
  if (job.action === 'set_admin') {
    const fromGroups = job.payload.groups?.length ?? 0;
    if (fromGroups > 0) return fromGroups;
    return job.payload.groupId?.trim() ? 1 : 0;
  }
  if (job.action === 'leave_group' || job.action === 'delete_group' || job.action === 'exit_delete_group') {
    const fromGroups = job.payload.groups?.length ?? 0;
    if (fromGroups > 0) return fromGroups;
    return job.payload.groupId?.trim() ? 1 : 0;
  }
  return 1;
}

export function isJobQueueBlockingExecutes(jobs: AutomationJobRecord[]): boolean {
  return jobs.some(
    (job) => job.status === 'running' || (job.status === 'queued' && !job.paused),
  );
}

/** Kontrak isolasi per akun — job queue akun A tidak blok Sync/Scrape akun B. */
export function isAccountJobQueueBusy(jobs: AutomationJobRecord[], accountId: string): boolean {
  return jobs.some(
    (job) =>
      job.accountId === accountId &&
      (job.status === 'running' || (job.status === 'queued' && !job.paused)),
  );
}

export function listBusyAccountIds(jobs: AutomationJobRecord[]): string[] {
  const ids = new Set<string>();
  for (const job of jobs) {
    if (job.status === 'running' || (job.status === 'queued' && !job.paused)) {
      ids.add(job.accountId);
    }
  }
  return [...ids];
}
