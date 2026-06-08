import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import {
  forceReleaseWhatsAppForLogin,
  probeWhatsAppSessionLinked,
} from '../platformLogin/whatsapp';
import { SESSION_CHECK_TIMEOUT_MS } from './deviceGroupScale';

function withSessionCheckTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error('SESSION_CHECK_TIMEOUT')),
        SESSION_CHECK_TIMEOUT_MS,
      );
    }),
  ]);
}

export async function validateTelegramSession(
  sessionId: string,
  storedSessionString?: string | null,
): Promise<{ valid: boolean; message?: string }> {
  try {
    await ensureSidecarRunning();

    const res = await fetch(`${SIDECAR_URL}/telegram/validate/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        sessionString: storedSessionString ?? undefined,
      }),
      signal: AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS),
    });

    const json = (await res.json()) as {
      status: string;
      valid?: boolean;
      message?: string;
    };

    if (!res.ok) {
      return { valid: false, message: json.message ?? `Telegram validate HTTP ${res.status}` };
    }

    if (json.status === 'error') {
      return { valid: false, message: json.message ?? 'Telegram validate failed' };
    }

    return { valid: Boolean(json.valid), message: json.message };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : 'Telegram validate failed',
    };
  }
}

/** WA: 1 akun, getState — tidak baca 1925 grup, timeout tetap 3s. */
export async function validateWhatsAppSession(
  sessionId: string,
  _options?: { strict?: boolean },
): Promise<{
  valid: boolean;
  message?: string;
}> {
  try {
    return await withSessionCheckTimeout(probeWhatsAppSessionLinked(sessionId));
  } catch (error) {
    await forceReleaseWhatsAppForLogin(sessionId, { urgent: true, fast: true }).catch(
      () => undefined,
    );
    return {
      valid: false,
      message: error instanceof Error ? error.message : 'WhatsApp validate failed',
    };
  }
}
