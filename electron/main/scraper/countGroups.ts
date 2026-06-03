import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import { countGroupsTimeoutMs } from './deviceGroupScale';

export async function countTelegramGroups(
  sessionId: string,
  storedSessionString?: string | null,
  options?: { quick?: boolean },
): Promise<{ valid: boolean; totalGroups: number; adminGroups: number; message?: string }> {
  await ensureSidecarRunning();

  const quick = Boolean(options?.quick);
  const res = await fetch(`${SIDECAR_URL}/telegram/count/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      sessionString: storedSessionString ?? undefined,
      quick,
    }),
    signal: AbortSignal.timeout(countGroupsTimeoutMs()),
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
