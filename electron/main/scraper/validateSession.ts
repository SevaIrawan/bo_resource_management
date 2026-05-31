import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import { ensureWhatsAppClient } from '../platformLogin/whatsapp';

export async function validateTelegramSession(
  sessionId: string,
  storedSessionString?: string | null,
): Promise<{ valid: boolean; message?: string }> {
  await ensureSidecarRunning();

  const res = await fetch(`${SIDECAR_URL}/telegram/validate/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      sessionString: storedSessionString ?? undefined,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const json = (await res.json()) as {
    status: string;
    valid?: boolean;
    message?: string;
  };

  if (!res.ok || json.status === 'error') {
    return { valid: false, message: json.message ?? 'Telegram validate failed' };
  }

  return { valid: Boolean(json.valid), message: json.message };
}

export async function validateWhatsAppSession(sessionId: string): Promise<{
  valid: boolean;
  message?: string;
}> {
  try {
    const client = await ensureWhatsAppClient(sessionId);
    const state = await client.getState();
    if (state !== 'CONNECTED') {
      return { valid: false, message: `WhatsApp state: ${state ?? 'disconnected'}` };
    }
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : 'WhatsApp validate failed',
    };
  }
}
