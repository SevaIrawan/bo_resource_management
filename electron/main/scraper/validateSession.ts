import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import { withNetworkRetry } from '../lib/networkRetry';
import {
  forceReleaseWhatsAppForLogin,
  getWhatsAppSessionClient,
  hasWhatsAppDiskAuth,
  withWhatsAppClient,
} from '../platformLogin/whatsapp';
import {
  classifyWaSocketState,
  waLinkProbeMessage,
  type WaLinkStatus,
} from './whatsappLinkState';

function probeResultFromWaState(state: string | null): { valid: boolean; message: string } {
  const link: WaLinkStatus = classifyWaSocketState(state);
  const message = waLinkProbeMessage(link, state);
  return { valid: link === 'linked', message };
}

export async function validateTelegramSession(
  sessionId: string,
  storedSessionString?: string | null,
): Promise<{ valid: boolean; message?: string }> {
  await ensureSidecarRunning();

  return withNetworkRetry('Validate Telegram session', async () => {
    const res = await fetch(`${SIDECAR_URL}/telegram/validate/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        sessionString: storedSessionString ?? undefined,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const json = (await res.json()) as {
      status: string;
      valid?: boolean;
      message?: string;
    };

    if (!res.ok) {
      throw new Error(json.message ?? `Telegram validate HTTP ${res.status}`);
    }

    if (json.status === 'error') {
      return { valid: false, message: json.message ?? 'Telegram validate failed' };
    }

    return { valid: Boolean(json.valid), message: json.message };
  });
}

export async function validateWhatsAppSession(
  sessionId: string,
  options?: { strict?: boolean },
): Promise<{
  valid: boolean;
  message?: string;
}> {
  const strict = options?.strict === true;

  try {
    if (!strict) {
      const live = getWhatsAppSessionClient(sessionId);
      if (live) {
        const state = await live.getState();
        return probeResultFromWaState(state);
      }

      if (hasWhatsAppDiskAuth(sessionId)) {
        return {
          valid: true,
          message: 'WA_LINKED',
        };
      }
    }

    const result = await withWhatsAppClient(sessionId, async (client) => {
      const state = await client.getState();
      return probeResultFromWaState(state);
    });

    if (strict && !result.valid) {
      await forceReleaseWhatsAppForLogin(sessionId);
    }

    return result;
  } catch (error) {
    await forceReleaseWhatsAppForLogin(sessionId).catch(() => undefined);
    return {
      valid: false,
      message: error instanceof Error ? error.message : 'WhatsApp validate failed',
    };
  }
}
