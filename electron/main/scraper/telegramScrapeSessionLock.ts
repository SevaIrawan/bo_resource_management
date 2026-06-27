/** Satu scrape TG per sessionId — hindari bentrok sidecar concurrent. */
const chains = new Map<string, Promise<void>>();

export async function withTelegramScrapeSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const tail = chains.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = tail.then(() => gate);
  chains.set(sessionId, queued);
  await tail;
  try {
    return await fn();
  } finally {
    release();
    if (chains.get(sessionId) === queued) {
      chains.delete(sessionId);
    }
  }
}
