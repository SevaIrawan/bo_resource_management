import { BrowserWindow } from 'electron';
import { getMaxTgExecuteSlots } from '../platformLogin/tgExecuteSlots';
import { getMaxWaBrowserSlots } from '../platformLogin/waBrowserPool';

export type ExecuteSlotKind = 'sync' | 'scraper' | 'job';
export type ExecuteSlotPlatform = 'whatsapp' | 'telegram';

type ActiveSlot = { kind: ExecuteSlotKind; platform: ExecuteSlotPlatform };

type PlatformPool = {
  activeByAccountId: Map<string, ActiveSlot>;
  fifoWaiters: Array<{
    accountId: string;
    kind: ExecuteSlotKind;
    resolve: () => void;
  }>;
};

const pools: Record<ExecuteSlotPlatform, PlatformPool> = {
  whatsapp: { activeByAccountId: new Map(), fifoWaiters: [] },
  telegram: { activeByAccountId: new Map(), fifoWaiters: [] },
};

function maxSlots(platform: ExecuteSlotPlatform): number {
  return platform === 'telegram' ? getMaxTgExecuteSlots() : getMaxWaBrowserSlots();
}

function poolFor(platform: ExecuteSlotPlatform): PlatformPool {
  return pools[platform];
}

function findPlatformForAccount(accountId: string): ExecuteSlotPlatform | null {
  if (pools.whatsapp.activeByAccountId.has(accountId)) return 'whatsapp';
  if (pools.telegram.activeByAccountId.has(accountId)) return 'telegram';
  return null;
}

function broadcastExecuteSlotsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('executeSlots:changed');
  }
}

export type ExecuteSlotPlatformStats = {
  maxConcurrent: number;
  activeCount: number;
  queuedCount: number;
  activeAccountIds: string[];
};

export function getExecuteSlotStatsForPlatform(
  platform: ExecuteSlotPlatform,
): ExecuteSlotPlatformStats {
  const pool = poolFor(platform);
  return {
    maxConcurrent: maxSlots(platform),
    activeCount: pool.activeByAccountId.size,
    queuedCount: pool.fifoWaiters.length,
    activeAccountIds: [...pool.activeByAccountId.keys()],
  };
}

/** Stats gabungan + per platform (WA/TG kuota terpisah). */
export function getExecuteSlotStats(): {
  maxConcurrent: number;
  activeCount: number;
  queuedCount: number;
  activeAccountIds: string[];
  byPlatform: Record<ExecuteSlotPlatform, ExecuteSlotPlatformStats>;
} {
  const whatsapp = getExecuteSlotStatsForPlatform('whatsapp');
  const telegram = getExecuteSlotStatsForPlatform('telegram');
  return {
    maxConcurrent: whatsapp.maxConcurrent + telegram.maxConcurrent,
    activeCount: whatsapp.activeCount + telegram.activeCount,
    queuedCount: whatsapp.queuedCount + telegram.queuedCount,
    activeAccountIds: [...whatsapp.activeAccountIds, ...telegram.activeAccountIds],
    byPlatform: { whatsapp, telegram },
  };
}

export function isExecuteSlotActiveForAccount(accountId: string): boolean {
  return findPlatformForAccount(accountId) !== null;
}

export function areAllExecuteSlotsFull(platform: ExecuteSlotPlatform): boolean {
  const pool = poolFor(platform);
  return pool.activeByAccountId.size >= maxSlots(platform);
}

export type TryAcquireExecuteSlotResult =
  | { ok: true }
  | { ok: false; reason: 'same_account' | 'slots_full' };

/** Slot Sync / Scrape / Job Queue — kuota per platform (WA 10, TG 10), tidak saling potong. */
export function tryAcquireExecuteSlot(
  accountId: string,
  kind: ExecuteSlotKind,
  platform: ExecuteSlotPlatform,
): TryAcquireExecuteSlotResult {
  if (isExecuteSlotActiveForAccount(accountId)) {
    return { ok: false, reason: 'same_account' };
  }
  const pool = poolFor(platform);
  if (pool.activeByAccountId.size >= maxSlots(platform)) {
    return { ok: false, reason: 'slots_full' };
  }
  pool.activeByAccountId.set(accountId, { kind, platform });
  broadcastExecuteSlotsChanged();
  return { ok: true };
}

export function releaseExecuteSlot(accountId: string): void {
  const platform = findPlatformForAccount(accountId);
  if (!platform) return;
  const pool = poolFor(platform);
  if (!pool.activeByAccountId.delete(accountId)) return;
  broadcastExecuteSlotsChanged();
  drainExecuteSlotFifo(platform);
}

function drainExecuteSlotFifo(platform: ExecuteSlotPlatform): void {
  const pool = poolFor(platform);
  const max = maxSlots(platform);
  while (pool.activeByAccountId.size < max && pool.fifoWaiters.length > 0) {
    const next = pool.fifoWaiters.shift();
    if (!next) break;
    if (isExecuteSlotActiveForAccount(next.accountId)) continue;
    pool.activeByAccountId.set(next.accountId, { kind: next.kind, platform });
    broadcastExecuteSlotsChanged();
    next.resolve();
  }
}

/** Tunggu slot kosong (FIFO per platform). Dipakai job queue runner. */
export function waitForExecuteSlot(
  accountId: string,
  kind: ExecuteSlotKind,
  platform: ExecuteSlotPlatform,
): Promise<void> {
  const immediate = tryAcquireExecuteSlot(accountId, kind, platform);
  if (immediate.ok) return Promise.resolve();
  if (immediate.reason === 'same_account') {
    return Promise.reject(new Error('EXECUTE_SLOT_SAME_ACCOUNT'));
  }
  const pool = poolFor(platform);
  return new Promise<void>((resolve) => {
    pool.fifoWaiters.push({ accountId, kind, resolve });
  });
}
