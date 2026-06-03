import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import { scrapeGroupsTimeoutMs } from './deviceGroupScale';
import { emitScrapeProgress } from './scrapeProgress';
import type { ScrapedGroupRow } from './index';

export async function exportTelegramSession(sessionId: string): Promise<{
  sessionString: string;
  loginMethod?: string;
}> {
  await ensureSidecarRunning();

  const maxAttempts = 8;
  let lastMessage = 'Failed to export Telegram session';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const res = await fetch(
      `${SIDECAR_URL}/telegram/session/export/${encodeURIComponent(sessionId)}`,
      { signal: AbortSignal.timeout(20_000) },
    );

    const json = (await res.json()) as {
      status: string;
      message?: string;
      sessionString?: string;
      loginMethod?: string;
    };

    if (!res.ok || json.status === 'error' || !json.sessionString) {
      lastMessage = json.message ?? lastMessage;
      const retryable =
        lastMessage.toLowerCase().includes('not ready') ||
        lastMessage.toLowerCase().includes('not found');
      if (retryable && attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      throw new Error(lastMessage);
    }

    return {
      sessionString: json.sessionString,
      loginMethod: json.loginMethod,
    };
  }

  throw new Error(lastMessage);
}

export async function restoreTelegramSession(
  sessionId: string,
  sessionString: string,
): Promise<void> {
  await ensureSidecarRunning();

  const res = await fetch(`${SIDECAR_URL}/telegram/session/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, sessionString }),
    signal: AbortSignal.timeout(45_000),
  });

  const json = (await res.json()) as { status: string; message?: string };

  if (!res.ok || json.status === 'error') {
    throw new Error(json.message ?? 'Failed to restore Telegram session');
  }
}

async function postTelegramScrape(
  sessionId: string,
  sessionString?: string | null,
): Promise<{
  status: string;
  message?: string;
  groups?: ScrapedGroupRow[];
  count?: number;
}> {
  const res = await fetch(`${SIDECAR_URL}/telegram/scrape/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionString: sessionString ?? undefined }),
    signal: AbortSignal.timeout(scrapeGroupsTimeoutMs()),
  });

  return (await res.json()) as {
    status: string;
    message?: string;
    groups?: ScrapedGroupRow[];
    count?: number;
  };
}

export async function runTelegramScrape(
  sessionId: string,
  storedSessionString?: string | null,
): Promise<{
  ok: boolean;
  groups: ScrapedGroupRow[];
  count: number;
}> {
  emitScrapeProgress({ sessionId, phase: 'start' });
  await ensureSidecarRunning();

  const sessionString = storedSessionString?.trim() || null;
  if (sessionString) {
    emitScrapeProgress({ sessionId, phase: 'connect', label: 'Restoring Telegram session' });
    await restoreTelegramSession(sessionId, sessionString);
  }

  emitScrapeProgress({ sessionId, phase: 'discover', label: 'Reading groups from Telegram' });
  let json = await postTelegramScrape(sessionId, sessionString);

  const needsRestore =
    json.status === 'error' &&
    typeof json.message === 'string' &&
    json.message.toLowerCase().includes('session');

  if (needsRestore && sessionString) {
    await restoreTelegramSession(sessionId, sessionString);
    json = await postTelegramScrape(sessionId, sessionString);
  }

  if (json.status === 'error') {
    const message = json.message ?? 'Telegram scrape failed';
    emitScrapeProgress({ sessionId, phase: 'error', label: message });
    throw new Error(message);
  }

  const count = json.count ?? json.groups?.length ?? 0;
  emitScrapeProgress({
    sessionId,
    phase: 'done',
    current: count,
    total: count,
    label: `Scrape finished: ${count} groups`,
  });

  return {
    ok: true,
    groups: json.groups ?? [],
    count,
    hint: (json as { hint?: string }).hint,
    telegramUser: (json as { telegramUser?: string }).telegramUser,
  };
}
