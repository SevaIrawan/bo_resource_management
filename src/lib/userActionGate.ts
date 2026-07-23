import { DEFAULT_MAX_EXECUTE_SLOTS } from '@/config/executeSlotPolicy';
import type { Platform } from '@/types/database';

/** Fallback mutex renderer (Electron memakai executeSlotPool via IPC). */
export type UserActionKind = 'sync' | 'scraper';

type LockState = { accountId: string; action: UserActionKind; platform: Platform };

const activeLocks = new Map<string, LockState>();
const fifoQueue: Array<{
  accountId: string;
  action: UserActionKind;
  platform: Platform;
  run: () => void;
}> = [];

export type UserActionLockResult =
  | { ok: true }
  | { ok: false; reason: 'same_account' | 'slots_full' };

function activeCountForPlatform(platform: Platform): number {
  let n = 0;
  for (const lock of activeLocks.values()) {
    if (lock.platform === platform) n += 1;
  }
  return n;
}

export function tryLockUserAction(
  accountId: string,
  action: UserActionKind,
  platform: Platform,
): UserActionLockResult {
  if (activeLocks.has(accountId)) {
    return { ok: false, reason: 'same_account' };
  }
  if (activeCountForPlatform(platform) >= DEFAULT_MAX_EXECUTE_SLOTS) {
    return { ok: false, reason: 'slots_full' };
  }
  activeLocks.set(accountId, { accountId, action, platform });
  return { ok: true };
}

export function unlockUserAction(accountId: string): void {
  const prev = activeLocks.get(accountId);
  if (!prev) return;
  activeLocks.delete(accountId);
  const nextIdx = fifoQueue.findIndex(
    (row) =>
      row.platform === prev.platform &&
      !activeLocks.has(row.accountId) &&
      activeCountForPlatform(row.platform) < DEFAULT_MAX_EXECUTE_SLOTS,
  );
  if (nextIdx < 0) return;
  const next = fifoQueue.splice(nextIdx, 1)[0];
  if (!next) return;
  activeLocks.set(next.accountId, {
    accountId: next.accountId,
    action: next.action,
    platform: next.platform,
  });
  next.run();
}

/** Antrian FIFO saat slot penuh — kontrak auto-queue (per platform). */
export function enqueueUserActionWhenSlotFree(
  accountId: string,
  action: UserActionKind,
  platform: Platform,
  run: () => void,
): void {
  fifoQueue.push({ accountId, action, platform, run });
}
