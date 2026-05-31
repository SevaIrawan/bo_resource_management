import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import { restoreTelegramSession } from './telegramScrape';

export async function countTelegramGroups(
  sessionId: string,
  storedSessionString?: string | null,
): Promise<{ valid: boolean; totalGroups: number; adminGroups: number; message?: string }> {
  await ensureSidecarRunning();

  const res = await fetch(`${SIDECAR_URL}/telegram/count/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      sessionString: storedSessionString ?? undefined,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const json = (await res.json()) as {
    status: string;
    valid?: boolean;
    totalGroups?: number;
    adminGroups?: number;
    message?: string;
  };

  if (!res.ok || json.status === 'error' || json.valid === false) {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: json.message ?? 'Session is not valid',
    };
  }

  return {
    valid: true,
    totalGroups: json.totalGroups ?? 0,
    adminGroups: json.adminGroups ?? 0,
  };
}

export { restoreTelegramSession };
