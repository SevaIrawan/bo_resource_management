/** Satu operasi automation aktif per sessionId — cegah tabrakan Telethon/WA. */

const accountLocks = new Map<string, Promise<unknown>>();

/** Max tunggu lock akun — job hung jangan blokir antrian selamanya. */
const ACCOUNT_LOCK_WAIT_MS = 90_000;

export function withAutomationAccountLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = accountLocks.get(sessionId) ?? Promise.resolve();
  const next = Promise.race([
    prev.then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      setTimeout(resolve, ACCOUNT_LOCK_WAIT_MS);
    }),
  ]).then(() => fn());
  accountLocks.set(sessionId, next);
  void next.finally(() => {
    if (accountLocks.get(sessionId) === next) {
      accountLocks.delete(sessionId);
    }
  });
  return next;
}

/** Lepas rantai lock hung setelah cancel/stale. */
export function forceReleaseAutomationAccountLock(sessionId: string): void {
  if (!sessionId.trim()) return;
  accountLocks.delete(sessionId);
}
