import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import {
  forceReleaseWhatsAppForLogin,
  probeWhatsAppSessionForSync,
  probeWhatsAppSessionLinked,
} from '../platformLogin/whatsapp';
import { SESSION_CHECK_TIMEOUT_MS } from './deviceGroupScale';

/**
 * Sync Active TG — ringan: string session di DB = Valid.
 * **Tidak** restore / connect / get_me (hindari timeout/busy).
 */
export async function validateTelegramSessionForSync(
  _sessionId: string,
  storedSessionString?: string | null,
): Promise<{ valid: boolean; message?: string }> {
  if (storedSessionString?.trim()) {
    return { valid: true, message: 'TG_STORED_SESSION_SYNC_LIGHT' };
  }
  return { valid: false, message: 'Login session not found. Log in first.' };
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

/** WA: Sync = light (no cold Chrome); scrape/strict = boleh initialize. */
export async function validateWhatsAppSession(
  sessionId: string,
  options?: { strict?: boolean },
): Promise<{
  valid: boolean;
  message?: string;
}> {
  const light = options?.strict === false;
  try {
    return light
      ? await probeWhatsAppSessionForSync(sessionId)
      : await probeWhatsAppSessionLinked(sessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp validate failed';
    if (light) {
      return { valid: false, message };
    }
    await forceReleaseWhatsAppForLogin(sessionId, { urgent: true, fast: true }).catch(
      () => undefined,
    );
    return {
      valid: false,
      message,
    };
  }
}
