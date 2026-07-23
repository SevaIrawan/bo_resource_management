import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import { withNetworkRetry } from '../lib/networkRetry';
import { SCRAPE_IDLE_TIMEOUT_MS } from './deviceGroupScale';
import { withScrapeWatchdog } from './scrapeWatchdog';
import { abortActiveScrape } from './scrapeCancel';
import { abortActiveAutoScrape } from './autoScrapeCancel';
import { withTelegramScrapeSessionLock } from './telegramScrapeSessionLock';
import { emitScrapeProgress, type ScrapeProgressPhase } from './scrapeProgress';
import type { ScrapedGroupRow } from './index';

const PROGRESS_POLL_MS = 400;

export async function cancelTelegramScrape(sessionId: string): Promise<void> {
  await ensureSidecarRunning();
  await fetch(`${SIDECAR_URL}/telegram/scrape/cancel/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function exportTelegramSession(sessionId: string): Promise<{
  sessionString: string;
  loginMethod?: string;
}> {
  await ensureSidecarRunning();

  return withNetworkRetry('Export Telegram session', async () => {
    const res = await fetch(
      `${SIDECAR_URL}/telegram/session/export/${encodeURIComponent(sessionId)}`,
      { signal: AbortSignal.timeout(30_000) },
    );

    const json = (await res.json()) as {
      status: string;
      message?: string;
      sessionString?: string;
      loginMethod?: string;
    };

    if (!res.ok || json.status === 'error' || !json.sessionString) {
      throw new Error(json.message ?? 'Failed to export Telegram session');
    }

    return {
      sessionString: json.sessionString,
      loginMethod: json.loginMethod,
    };
  });
}

export async function restoreTelegramSession(
  sessionId: string,
  sessionString: string,
): Promise<void> {
  await ensureSidecarRunning();

  await withNetworkRetry('Restore Telegram session', async () => {
    const res = await fetch(`${SIDECAR_URL}/telegram/session/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, sessionString }),
      signal: AbortSignal.timeout(60_000),
    });

    const json = (await res.json()) as { status: string; message?: string };

    if (!res.ok || json.status === 'error') {
      throw new Error(json.message ?? 'Failed to restore Telegram session');
    }
  });
}

async function pollTelegramScrapeProgress(
  sessionId: string,
  until: { done: boolean },
): Promise<void> {
  /** Hanya emit (dan touch idle watchdog) bila progress benar-benar berubah — hindari fake-alive. */
  let lastFingerprint = '';

  while (!until.done) {
    await sleep(PROGRESS_POLL_MS);
    try {
      const res = await fetch(
        `${SIDECAR_URL}/telegram/scrape/progress/${encodeURIComponent(sessionId)}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!res.ok) continue;

      const json = (await res.json()) as {
        phase?: string;
        current?: number;
        total?: number;
        label?: string;
        seq?: number;
      };
      if (!json.phase || json.phase === 'idle') continue;

      const fingerprint = [
        json.phase,
        json.current ?? 0,
        json.total ?? 0,
        json.label ?? '',
        json.seq ?? 0,
      ].join('|');
      if (fingerprint === lastFingerprint) continue;
      lastFingerprint = fingerprint;

      emitScrapeProgress({
        sessionId,
        phase: json.phase as ScrapeProgressPhase,
        current: json.current,
        total: json.total,
        label: json.label,
      });
    } catch {
      // sidecar busy or scrape finished
    }
  }
}

async function postTelegramScrape(
  sessionId: string,
  sessionString?: string | null,
  expectedPhone?: string,
): Promise<{
  status: string;
  message?: string;
  groups?: ScrapedGroupRow[];
  count?: number;
  telegramUser?: string;
  elapsedMs?: number;
}> {
  return withNetworkRetry('Telegram scrape', async () => {
    const res = await fetch(`${SIDECAR_URL}/telegram/scrape/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionString: sessionString ?? undefined,
        expectedPhone: expectedPhone?.trim() || undefined,
      }),
    });

    const json = (await res.json()) as {
      status: string;
      message?: string;
      groups?: ScrapedGroupRow[];
      count?: number;
      telegramUser?: string;
      elapsedMs?: number;
    };

    if (!res.ok) {
      throw new Error(json.message ?? `Telegram scrape HTTP ${res.status}`);
    }

    return json;
  });
}

export async function runTelegramScrape(
  sessionId: string,
  storedSessionString?: string | null,
  expectedPhone?: string,
): Promise<{
  ok: boolean;
  groups: ScrapedGroupRow[];
  count: number;
  hint?: string;
  telegramUser?: string;
  elapsedMs?: number;
}> {
  return withTelegramScrapeSessionLock(sessionId, () =>
    withScrapeWatchdog(
      sessionId,
      () => runTelegramScrapeInner(sessionId, storedSessionString, expectedPhone),
      {
        label: 'Telegram scrape',
        idleMs: SCRAPE_IDLE_TIMEOUT_MS,
        onStale: async (sid) => {
          await abortActiveScrape(sid, 'telegram');
          await cancelTelegramScrape(sid);
        },
      },
    ),
  );
}

/** Auto scrape lane — cancel registry terpisah; sidecar sama, tidak blok user scrape guard. */
export async function runTelegramScrapeAutoLane(
  sessionId: string,
  storedSessionString?: string | null,
  expectedPhone?: string,
): Promise<{
  ok: boolean;
  groups: ScrapedGroupRow[];
  count: number;
  hint?: string;
  telegramUser?: string;
  elapsedMs?: number;
}> {
  return withTelegramScrapeSessionLock(sessionId, () =>
    withScrapeWatchdog(
      sessionId,
      () => runTelegramScrapeInner(sessionId, storedSessionString, expectedPhone),
      {
        label: 'Telegram auto scrape',
        idleMs: SCRAPE_IDLE_TIMEOUT_MS,
        onStale: async (sid) => {
          await abortActiveAutoScrape(sid, 'telegram');
          await cancelTelegramScrape(sid);
        },
      },
    ),
  );
}

async function runTelegramScrapeInner(
  sessionId: string,
  storedSessionString?: string | null,
  expectedPhone?: string,
): Promise<{
  ok: boolean;
  groups: ScrapedGroupRow[];
  count: number;
  hint?: string;
  telegramUser?: string;
  elapsedMs?: number;
}> {
  emitScrapeProgress({ sessionId, phase: 'start' });
  await ensureSidecarRunning();

  const sessionString = storedSessionString?.trim() || null;
  if (sessionString) {
    emitScrapeProgress({ sessionId, phase: 'connect', label: 'Restoring Telegram session' });
    await restoreTelegramSession(sessionId, sessionString);
  }

  emitScrapeProgress({ sessionId, phase: 'discover', label: 'Reading groups from Telegram' });

  const pollUntil = { done: false };
  const pollTask = pollTelegramScrapeProgress(sessionId, pollUntil);

  let json: Awaited<ReturnType<typeof postTelegramScrape>>;
  try {
    json = await postTelegramScrape(sessionId, sessionString, expectedPhone);

    const needsRestore =
      json.status === 'error' &&
      typeof json.message === 'string' &&
      json.message.toLowerCase().includes('session');

    if (needsRestore && sessionString) {
      await restoreTelegramSession(sessionId, sessionString);
      json = await postTelegramScrape(sessionId, sessionString, expectedPhone);
    }
  } finally {
    pollUntil.done = true;
    await pollTask.catch(() => undefined);
  }

  if (json.status === 'cancelled') {
    emitScrapeProgress({ sessionId, phase: 'error', label: 'SCRAPER_CANCELLED' });
    throw new Error('SCRAPER_CANCELLED');
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
    telegramUser: json.telegramUser,
    elapsedMs: json.elapsedMs,
  };
}
