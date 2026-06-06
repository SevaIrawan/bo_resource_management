/** Mutex sinkron — satu Sync/Run aktif per PC (logic_sync_scraper.txt implisit: cegah multi-Chrome). */
export type UserActionKind = 'sync' | 'scraper';

type LockState = { accountId: string; action: UserActionKind };

let activeLock: LockState | null = null;

export type UserActionLockResult =
  | { ok: true }
  | { ok: false; reason: 'same_account' | 'other_account' };

export function tryLockUserAction(accountId: string, action: UserActionKind): UserActionLockResult {
  if (!activeLock) {
    activeLock = { accountId, action };
    return { ok: true };
  }
  if (activeLock.accountId === accountId) {
    return { ok: false, reason: 'same_account' };
  }
  return { ok: false, reason: 'other_account' };
}

export function unlockUserAction(accountId: string): void {
  if (activeLock?.accountId === accountId) {
    activeLock = null;
  }
}

export function userActionLockErrorCode(
  result: Extract<UserActionLockResult, { ok: false }>,
): string {
  return result.reason === 'other_account' ? 'OPERATION_GLOBAL_BUSY' : 'OPERATION_ALREADY_RUNNING';
}
