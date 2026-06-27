import { forceReleaseWhatsAppForLogin } from '../platformLogin/whatsapp';

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

/** Batalkan count grup di main — lepas Chrome WA agar tidak zombie setelah renderer timeout. */
export async function cancelCountGroups(
  sessionId: string,
  platform: Platform,
): Promise<{ ok: boolean }> {
  countAbortBySession.get(sessionId)?.abort();

  let released = false;
  if (platform === 'whatsapp') {
    await forceReleaseWhatsAppForLogin(sessionId, { urgent: true, fast: true }).catch(
      (error) => {
        console.warn('[count-cancel] WA release failed:', error);
      },
    );
    released = true;
  }

  clearCountAbort(sessionId);

  return { ok: released || platform === 'telegram' };
}
