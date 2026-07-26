import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import {
  forceReleaseWhatsAppForLogin,
  probeWhatsAppSessionLinked,
} from '../platformLogin/whatsapp';
import { SESSION_CHECK_TIMEOUT_MS } from './deviceGroupScale';

/** TG: Check Session ke sidecar/device — bukan “string di DB = Valid”. */
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
    const raw = error instanceof Error ? error.message : 'Telegram validate failed';
    const lower = raw.toLowerCase();
    const name = error instanceof Error ? error.name.toLowerCase() : '';
    const transport =
      name === 'timeouterror' ||
      lower.includes('fetch failed') ||
      lower.includes('failed to fetch') ||
      lower.includes('aborted due to timeout') ||
      lower.includes('operation was aborted') ||
      lower.includes('econnrefused') ||
      lower.includes('econnreset') ||
      lower.includes('etimedout');
    return {
      valid: false,
      message: transport ? 'SCRAPER_TG_CONNECT_FAILED' : raw,
    };
  }
}

/**
 * WA: Check Session langsung ke device (getState / cold boot bila perlu).
 * Bukan LocalAuth disk-only — file di disk ≠ linked di HP.
 */
export async function validateWhatsAppSession(
  sessionId: string,
  _options?: { strict?: boolean },
): Promise<{
  valid: boolean;
  message?: string;
}> {
  void _options;
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
