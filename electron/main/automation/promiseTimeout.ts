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
 * Tunggu work selesai meski timeout — signal cooperative stop dulu, baru settle.
 * Mencegah release execute slot sementara Chrome/TG masih jalan.
 */
export async function withJobTimeoutSettle<T>(
  work: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
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

  try {
    const value = await work;
    clearTimeout(timer);
    if (timedOut) return { timedOut: true, value };
    return { timedOut: false, value };
  } catch (error) {
    clearTimeout(timer);
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
