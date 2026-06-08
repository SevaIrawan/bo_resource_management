import {
  forceReleaseWhatsAppForLogin,
  listActiveWhatsAppSessionIds,
} from '../platformLogin/whatsapp';

type Platform = 'whatsapp' | 'telegram';

const countAbortBySession = new Map<string, AbortController>();

export function registerCountAbort(sessionId: string): AbortSignal {
  const prev = countAbortBySession.get(sessionId);
  prev?.abort();
  const ac = new AbortController();
  countAbortBySession.set(sessionId, ac);
  return ac.signal;
}

export function clearCountAbort(sessionId: string): void {
  countAbortBySession.delete(sessionId);
}

export function isCountAborted(sessionId: string): boolean {
  return countAbortBySession.get(sessionId)?.signal.aborted ?? false;
}

export function isAnyCountAborted(): boolean {
  for (const ac of countAbortBySession.values()) {
    if (ac.signal.aborted) return true;
  }
  return false;
}

/** Batalkan count grup di main — lepas Chrome WA agar tidak zombie setelah renderer timeout. */
export async function cancelCountGroups(
  sessionId: string,
  platform: Platform,
): Promise<{ ok: boolean }> {
  const ids =
    platform === 'whatsapp'
      ? [sessionId, ...listActiveWhatsAppSessionIds().filter((id) => id !== sessionId)]
      : [sessionId];

  let released = false;
  for (const id of ids) {
    countAbortBySession.get(id)?.abort();
    if (platform === 'whatsapp') {
      await forceReleaseWhatsAppForLogin(id, { urgent: true, fast: true }).catch(() => undefined);
      released = true;
    }
  }

  for (const id of ids) {
    clearCountAbort(id);
  }

  return { ok: released || platform === 'telegram' };
}
