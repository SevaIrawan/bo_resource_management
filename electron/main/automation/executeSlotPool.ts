import { BrowserWindow } from 'electron';
import { getMaxWaBrowserSlots } from '../platformLogin/waBrowserPool';

export type ExecuteSlotKind = 'sync' | 'scraper' | 'job';

type ActiveSlot = { kind: ExecuteSlotKind };

const activeByAccountId = new Map<string, ActiveSlot>();
const fifoWaiters: Array<{ accountId: string; kind: ExecuteSlotKind; resolve: () => void }> = [];

function maxSlots(): number {
  return getMaxWaBrowserSlots();
}

function broadcastExecuteSlotsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('executeSlots:changed');
  }
}

export function getExecuteSlotStats(): {
  maxConcurrent: number;
  activeCount: number;
  queuedCount: number;
  activeAccountIds: string[];
} {
  return {
    maxConcurrent: maxSlots(),
    activeCount: activeByAccountId.size,
    queuedCount: fifoWaiters.length,
    activeAccountIds: [...activeByAccountId.keys()],
  };
}

export function isExecuteSlotActiveForAccount(accountId: string): boolean {
  return activeByAccountId.has(accountId);
}

export function areAllExecuteSlotsFull(): boolean {
  return activeByAccountId.size >= maxSlots();
}

export type TryAcquireExecuteSlotResult =
  | { ok: true }
  | { ok: false; reason: 'same_account' | 'slots_full' };

/** Satu sumber slot untuk Sync, Scrape, dan Job Queue (kontrak max 4 akun paralel). */
export function tryAcquireExecuteSlot(
  accountId: string,
  kind: ExecuteSlotKind,
): TryAcquireExecuteSlotResult {
  if (activeByAccountId.has(accountId)) {
    return { ok: false, reason: 'same_account' };
  }
  if (activeByAccountId.size >= maxSlots()) {
    return { ok: false, reason: 'slots_full' };
  }
  activeByAccountId.set(accountId, { kind });
  broadcastExecuteSlotsChanged();
  return { ok: true };
}

export function releaseExecuteSlot(accountId: string): void {
  if (!activeByAccountId.delete(accountId)) return;
  broadcastExecuteSlotsChanged();
  drainExecuteSlotFifo();
}

function drainExecuteSlotFifo(): void {
  while (activeByAccountId.size < maxSlots() && fifoWaiters.length > 0) {
    const next = fifoWaiters.shift();
    if (!next) break;
    if (activeByAccountId.has(next.accountId)) continue;
    activeByAccountId.set(next.accountId, { kind: next.kind });
    broadcastExecuteSlotsChanged();
    next.resolve();
  }
}

/** Tunggu slot kosong (FIFO antar akun). Dipakai job queue runner. */
export function waitForExecuteSlot(accountId: string, kind: ExecuteSlotKind): Promise<void> {
  const immediate = tryAcquireExecuteSlot(accountId, kind);
  if (immediate.ok) return Promise.resolve();
  if (immediate.reason === 'same_account') {
    return Promise.reject(new Error('EXECUTE_SLOT_SAME_ACCOUNT'));
  }
  return new Promise<void>((resolve) => {
    fifoWaiters.push({ accountId, kind, resolve });
  });
}
