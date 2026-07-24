import {
  CREATE_GROUP_MAX_PER_ACCOUNT_RUN,
  isMasterOpsRole,
} from '@/config/accountOpsRole';
import type { AutomationJobRecord } from '@/types/automationJob';
import type { AccountBrandRow } from '@/types/accountMonitoringUi';

/** YYYY-MM-DD kalender lokal device. */
export function localCalendarDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoToLocalDayKey(iso: string | undefined): string | null {
  if (!iso?.trim()) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return localCalendarDayKey(t);
}

function jobTouchesLocalDay(job: AutomationJobRecord, dayKey: string): boolean {
  /** Hanya waktu execute (bukan createdAt queue) — supaya job lama di antrian tidak “mengunci” hari ini. */
  const keys = [isoToLocalDayKey(job.startedAt), isoToLocalDayKey(job.finishedAt)].filter(
    Boolean,
  );
  return keys.includes(dayKey);
}

export type CreateGroupDayUsage = {
  executedToday: boolean;
  createdCountToday: number;
};

/** Usage create_group hari ini untuk satu akun (dari job queue lokal). */
export function createGroupDayUsageForAccount(
  jobs: AutomationJobRecord[],
  accountId: string,
  dayKey = localCalendarDayKey(),
): CreateGroupDayUsage {
  const relevant = jobs.filter(
    (job) =>
      job.accountId === accountId &&
      job.action === 'create_group' &&
      jobTouchesLocalDay(job, dayKey),
  );

  let createdCountToday = 0;
  let executedToday = false;

  for (const job of relevant) {
    const startedOrDone =
      Boolean(job.startedAt) ||
      job.status === 'running' ||
      job.status === 'completed' ||
      job.status === 'failed';
    if (startedOrDone) executedToday = true;

    const outcomes = job.payload.groupOutcomes;
    if (Array.isArray(outcomes) && outcomes.length > 0) {
      createdCountToday += outcomes.filter((row) => row.createStatus === 'created').length;
      continue;
    }
    const progressCurrent = Math.max(0, Math.floor(Number(job.progress?.current) || 0));
    if (job.status === 'completed' || job.status === 'running' || job.status === 'failed') {
      createdCountToday += progressCurrent;
    }
  }

  return { executedToday, createdCountToday };
}

/**
 * Hide dari dropdown Create jika:
 * - sudah pernah execute create hari ini, ATAU
 * - sudah mencapai limit branch (max per run).
 */
export function shouldHideCreateAccountFromSelect(
  usage: CreateGroupDayUsage,
  maxPerRun = CREATE_GROUP_MAX_PER_ACCOUNT_RUN,
): boolean {
  const limit = Math.max(1, Math.floor(maxPerRun));
  return usage.executedToday || usage.createdCountToday >= limit;
}

export function isEligibleCreateGroupAccount(
  account: Pick<AccountBrandRow, 'opsRole' | 'sessionStatus'>,
  usage: CreateGroupDayUsage,
  maxPerRun = CREATE_GROUP_MAX_PER_ACCOUNT_RUN,
): boolean {
  if (!isMasterOpsRole(account.opsRole)) return false;
  if (account.sessionStatus !== 'valid') return false;
  if (shouldHideCreateAccountFromSelect(usage, maxPerRun)) return false;
  return true;
}

export function clampCreateGroupTotalToMax(
  total: number,
  maxPerRun = CREATE_GROUP_MAX_PER_ACCOUNT_RUN,
): number {
  const limit = Math.max(1, Math.floor(maxPerRun));
  const n = Math.floor(Number(total) || 0);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(limit, n);
}
