/** Retry jaringan / lag — renderer (Sync, Scrape, persist session). */
export const NETWORK_RETRY_ATTEMPTS = 3;
export const NETWORK_RETRY_BASE_DELAY_MS = 2_500;

export function isRetryableNetworkError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (err instanceof Error && err.name === 'OperationTimeoutError') {
    return true;
  }
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    msg.includes('abort') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('429') ||
    msg.includes('internal server error') ||
    msg.includes('empty response') ||
    msg.includes('disconnected') ||
    msg.includes('session check timed out') ||
    msg.includes('temporarily unavailable')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function withNetworkRetry<T>(
  label: string,
  fn: (attempt: number) => Promise<T>,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = options?.attempts ?? NETWORK_RETRY_ATTEMPTS;
  const baseDelayMs = options?.baseDelayMs ?? NETWORK_RETRY_BASE_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const lastAttempt = attempt >= attempts - 1;
      if (lastAttempt || !isRetryableNetworkError(err)) {
        throw err;
      }
      const waitMs = baseDelayMs * (attempt + 1);
      console.warn(
        `[retry] ${label} attempt ${attempt + 1}/${attempts} — retry in ${waitMs}ms`,
        err,
      );
      await sleep(waitMs);
    }
  }

  throw lastError;
}
