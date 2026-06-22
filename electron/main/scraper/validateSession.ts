import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import {
  forceReleaseWhatsAppForLogin,
  probeWhatsAppSessionLinked,
} from '../platformLogin/whatsapp';
import { SESSION_CHECK_TIMEOUT_MS } from './deviceGroupScale';

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

/** WA: 1 akun, getState — timeout di probeWhatsAppSessionLinked (bukan race ganda di sini). */
export async function validateWhatsAppSession(
  sessionId: string,
  _options?: { strict?: boolean },
): Promise<{
  valid: boolean;
  message?: string;
}> {
  try {
    return await probeWhatsAppSessionLinked(sessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp validate failed';
    await forceReleaseWhatsAppForLogin(sessionId, { urgent: true, fast: true }).catch(
      () => undefined,
    );
    return {
      valid: false,
      message,
    };
  }
}
