/** Jeda setelah job automation selesai — Chrome/WA cleanup sebelum job berikutnya. */
export const POST_JOB_SETTLE_MS = 15_000;

const settleUntilBySession = new Map<string, number>();

export function markSessionSettleAfterJob(sessionId: string): void {
  if (!sessionId.trim()) return;
  settleUntilBySession.set(sessionId, Date.now() + POST_JOB_SETTLE_MS);
}

export function isSessionSettling(sessionId: string): boolean {
  const until = settleUntilBySession.get(sessionId);
  if (until == null) return false;
  if (Date.now() >= until) {
    settleUntilBySession.delete(sessionId);
    return false;
  }
  return true;
}

export function listSettlingSessionIds(): string[] {
  const now = Date.now();
  const active: string[] = [];
  for (const [sessionId, until] of settleUntilBySession) {
    if (now >= until) {
      settleUntilBySession.delete(sessionId);
      continue;
    }
    active.push(sessionId);
  }
  return active;
}
