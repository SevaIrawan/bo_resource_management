import { DEFAULT_MAX_EXECUTE_SLOTS } from '@/config/executeSlotPolicy';

/** Fallback mutex renderer (Electron memakai executeSlotPool via IPC). */
export type UserActionKind = 'sync' | 'scraper';

type LockState = { accountId: string; action: UserActionKind };

const activeLocks = new Map<string, LockState>();
const fifoQueue: Array<{ accountId: string; action: UserActionKind; run: () => void }> = [];

export type UserActionLockResult =
  | { ok: true }
  | { ok: false; reason: 'same_account' | 'slots_full' };

export function tryLockUserAction(accountId: string, action: UserActionKind): UserActionLockResult {
  if (activeLocks.has(accountId)) {
    return { ok: false, reason: 'same_account' };
  }
  if (activeLocks.size >= DEFAULT_MAX_EXECUTE_SLOTS) {
    return { ok: false, reason: 'slots_full' };
  }
  activeLocks.set(accountId, { accountId, action });
  return { ok: true };
}

export function unlockUserAction(accountId: string): void {
  if (!activeLocks.delete(accountId)) return;
  const next = fifoQueue.shift();
  if (next && !activeLocks.has(next.accountId) && activeLocks.size < DEFAULT_MAX_EXECUTE_SLOTS) {
    activeLocks.set(next.accountId, { accountId: next.accountId, action: next.action });
    next.run();
  }
}

/** Antrian FIFO saat slot penuh — kontrak auto-queue. */
export function enqueueUserActionWhenSlotFree(
  accountId: string,
  action: UserActionKind,
  run: () => void,
): void {
  fifoQueue.push({ accountId, action, run });
}
