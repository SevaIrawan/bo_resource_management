import type { UserActionKind } from '@/lib/userActionGate';

function executeSlotApi() {
  return window.electronAPI?.executeSlots;
}

export type ExecuteSlotAcquireResult =
  | { ok: true; queued?: boolean }
  | { ok: false; reason: 'same_account' | 'slots_full' | 'unavailable' };

export async function acquireExecuteSlot(
  accountId: string,
  kind: UserActionKind,
  onQueued?: () => void,
): Promise<ExecuteSlotAcquireResult> {
  const api = executeSlotApi()?.acquireOrWait;
  if (api) {
    const result = await api(accountId, kind);
    if (!result.ok) {
      return { ok: false, reason: result.reason ?? 'same_account' };
    }
    if (result.queued && onQueued) onQueued();
    return { ok: true, queued: result.queued };
  }
  const { tryLockUserAction, enqueueUserActionWhenSlotFree } = await import('@/lib/userActionGate');
  const lock = tryLockUserAction(accountId, kind);
  if (lock.ok) return { ok: true, queued: false };
  if (lock.reason === 'same_account') {
    return { ok: false, reason: 'same_account' };
  }
  return new Promise<ExecuteSlotAcquireResult>((resolve) => {
    enqueueUserActionWhenSlotFree(accountId, kind, () => {
      if (onQueued) onQueued();
      resolve({ ok: true, queued: true });
    });
  });
}

export async function releaseExecuteSlot(accountId: string): Promise<void> {
  const api = executeSlotApi()?.release;
  if (api) {
    await api(accountId);
    return;
  }
  const { unlockUserAction } = await import('@/lib/userActionGate');
  unlockUserAction(accountId);
}

export function subscribeExecuteSlotsChanged(callback: () => void): () => void {
  const api = executeSlotApi()?.onChanged;
  if (!api) return () => undefined;
  return api(callback);
}

export function executeSlotErrorCode(
  result: Extract<ExecuteSlotAcquireResult, { ok: false }>,
): string {
  if (result.reason === 'same_account') return 'OPERATION_ALREADY_RUNNING';
  if (result.reason === 'slots_full') return 'EXECUTE_SLOTS_FULL';
  return 'OPERATION_GLOBAL_BUSY';
}
