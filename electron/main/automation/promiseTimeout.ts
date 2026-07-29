export function withPromiseTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label}_TIMEOUT after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    // Swallow late settle — hindari UnhandledPromiseRejection setelah timeout menang.
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type JobTimeoutResult<T> =
  | { timedOut: false; value: T }
  | { timedOut: true; value?: T; error?: unknown };

/**
 * Tunggu work selesai; signal cooperative stop saat timeout.
 * Setelah timeout+grace, force settle — jangan hung berjam-jam menunggu fetch/sidecar.
 */
export async function withJobTimeoutSettle<T>(
  work: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  forceSettleAfterMs: number = 120_000,
): Promise<JobTimeoutResult<T>> {
  if (timeoutMs <= 0) {
    try {
      return { timedOut: false, value: await work };
    } catch (error) {
      throw error;
    }
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    onTimeout();
  }, timeoutMs);

  let forceTimer: ReturnType<typeof setTimeout> | null = null;
  const forcePromise = new Promise<'force'>((resolve) => {
    forceTimer = setTimeout(() => resolve('force'), timeoutMs + Math.max(0, forceSettleAfterMs));
  });

  try {
    const raced = await Promise.race([
      work.then((value) => ({ kind: 'ok' as const, value })),
      forcePromise.then(() => ({ kind: 'force' as const })),
    ]);
    clearTimeout(timer);
    if (forceTimer) clearTimeout(forceTimer);

    if (raced.kind === 'force') {
      return { timedOut: true };
    }
    if (timedOut) return { timedOut: true, value: raced.value };
    return { timedOut: false, value: raced.value };
  } catch (error) {
    clearTimeout(timer);
    if (forceTimer) clearTimeout(forceTimer);
    if (timedOut) return { timedOut: true, error };
    throw error;
  }
}

/** @deprecated Prefer withJobTimeoutSettle — reject prematur melepas slot sebelum device idle. */
export async function withJobTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  action: string,
): Promise<T> {
  return withPromiseTimeout(promise, timeoutMs, `JOB_${action}`);
}
