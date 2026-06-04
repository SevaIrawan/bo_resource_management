import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import { withNetworkRetry } from '../lib/networkRetry';
import { countGroupsTimeoutMs } from './deviceGroupScale';

export async function countTelegramGroups(
  sessionId: string,
  storedSessionString?: string | null,
  options?: { quick?: boolean },
): Promise<{ valid: boolean; totalGroups: number; adminGroups: number; message?: string }> {
  await ensureSidecarRunning();

  const quick = Boolean(options?.quick);

  try {
    const json = await withNetworkRetry('Count Telegram groups', async () => {
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

      const body = (await res.json()) as {
        status: string;
        valid?: boolean;
        totalGroups?: number;
        adminGroups?: number;
        message?: string;
      };

      if (!res.ok) {
        throw new Error(body.message ?? `Count groups HTTP ${res.status}`);
      }

      return body;
    });

    if (json.status === 'error' || json.valid === false) {
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
  } catch (error) {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: error instanceof Error ? error.message : 'Count groups failed',
    };
  }
}

export { restoreTelegramSession } from './telegramScrape';
