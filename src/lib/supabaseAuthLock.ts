/** In-process auth lock — avoids Navigator LockManager null-lock spam in Electron/Chromium. */
type AuthLockFunc = <R>(name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R>;

const chains = new Map<string, Promise<unknown>>();

export const supabaseInProcessAuthLock: AuthLockFunc = async (name, _acquireTimeout, fn) => {
  const previous = chains.get(name) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(() => fn());
  chains.set(
    name,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
};
