import { ensureSidecarRunning, SIDECAR_URL } from '../platformLogin/telegramSidecar';
import { withNetworkRetry } from '../lib/networkRetry';
import { scrapeIdleTimeoutMs, DEVICE_GROUP_TARGET_MAX } from './deviceGroupScale';
import { withScrapeWatchdog } from './scrapeWatchdog';
import { abortActiveScrape } from './scrapeCancel';
import { abortActiveAutoScrape } from './autoScrapeCancel';
import { withTelegramScrapeSessionLock } from './telegramScrapeSessionLock';
import { emitScrapeProgress, type ScrapeProgressPhase } from './scrapeProgress';
import type { ScrapedGroupRow } from './index';

const PROGRESS_POLL_MS = 400;
/** Restore session string besar + connect Telethon — jangan 60s (TimeoutError mentah). */
const TG_RESTORE_TIMEOUT_MS = 300_000;
const TG_EXPORT_TIMEOUT_MS = 120_000;
/** Start scrape HTTP pendek — sidecar bisa sibuk restore; jangan 60s ketat. */
const TG_SCRAPE_START_TIMEOUT_MS = 180_000;
const TG_CONNECT_FAILED = 'SCRAPER_TG_CONNECT_FAILED';

export async function cancelTelegramScrape(sessionId: string): Promise<void> {
  await ensureSidecarRunning().catch(() => undefined);
  await fetch(`${SIDECAR_URL}/telegram/scrape/cancel/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTelegramTransportError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const name = err instanceof Error ? err.name.toLowerCase() : '';
  return (
    name === 'timeouterror' ||
    msg.includes('fetch failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('aborted due to timeout') ||
    msg.includes('operation was aborted') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('empty response')
  );
}

/** Jangan surfacing TypeError/TimeoutError mentah ke UI. */
function toTelegramScrapeError(err: unknown): Error {
  if (err instanceof Error) {
    if (err.message.startsWith('SCRAPER_')) return err;
    if (err.message === 'SCRAPER_CANCELLED') return err;
  }
  if (isTelegramTransportError(err)) {
    return new Error(TG_CONNECT_FAILED);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function exportTelegramSession(sessionId: string): Promise<{
  sessionString: string;
  loginMethod?: string;
}> {
  await ensureSidecarRunning();

  try {
    return await withNetworkRetry('Export Telegram session', async () => {
      await ensureSidecarRunning();
      const res = await fetch(
        `${SIDECAR_URL}/telegram/session/export/${encodeURIComponent(sessionId)}`,
        { signal: AbortSignal.timeout(TG_EXPORT_TIMEOUT_MS) },
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
  } catch (err) {
    throw toTelegramScrapeError(err);
  }
}

export async function restoreTelegramSession(
  sessionId: string,
  sessionString: string,
): Promise<void> {
  await ensureSidecarRunning();

  try {
    await withNetworkRetry('Restore Telegram session', async () => {
      await ensureSidecarRunning();
      const res = await fetch(`${SIDECAR_URL}/telegram/session/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, sessionString }),
        signal: AbortSignal.timeout(TG_RESTORE_TIMEOUT_MS),
      });

      const json = (await res.json()) as { status: string; message?: string };

      if (!res.ok || json.status === 'error') {
        throw new Error(json.message ?? 'Failed to restore Telegram session');
      }
    });
  } catch (err) {
    throw toTelegramScrapeError(err);
  }
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
  hint?: string;
  sessionString?: string;
  loginMethod?: string;
}> {
  await ensureSidecarRunning();

  // Start saja (HTTP pendek). Scrape jalan di background sidecar —
  // POST panjang 30+ menit putus → fetch failed / SCRAPER_TG_CONNECT palsu.
  try {
    const startRes = await fetch(`${SIDECAR_URL}/telegram/scrape/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionString: sessionString ?? undefined,
        expectedPhone: expectedPhone?.trim() || undefined,
      }),
      signal: AbortSignal.timeout(TG_SCRAPE_START_TIMEOUT_MS),
    });
    const startJson = (await startRes.json()) as { status?: string; message?: string };
    if (!startRes.ok || (startJson.status !== 'started' && startJson.status !== 'ok')) {
      throw new Error(startJson.message ?? `Telegram scrape start HTTP ${startRes.status}`);
    }
  } catch (err) {
    throw toTelegramScrapeError(err);
  }

  // Poll hasil via request pendek — jangan retry-ulang scrape penuh.
  let idleMisses = 0;
  for (;;) {
    await sleep(500);
    try {
      const res = await fetch(
        `${SIDECAR_URL}/telegram/scrape/result/${encodeURIComponent(sessionId)}`,
        { signal: AbortSignal.timeout(20_000) },
      );
      if (!res.ok) continue;

      const json = (await res.json()) as {
        status: string;
        message?: string;
        groups?: ScrapedGroupRow[];
        count?: number;
        telegramUser?: string;
        elapsedMs?: number;
        hint?: string;
        partial?: boolean;
        sessionString?: string;
        loginMethod?: string;
      };

      if (json.status === 'running') {
        idleMisses = 0;
        continue;
      }

      if (json.status === 'idle') {
        idleMisses += 1;
        // ~2 menit grace — scrape background baru start / result belum tertulis.
        if (idleMisses >= 240) {
          throw new Error(TG_CONNECT_FAILED);
        }
        continue;
      }

      return json;
    } catch (err) {
      if (err instanceof Error && err.message === TG_CONNECT_FAILED) throw err;
      // Blip jaringan singkat — scrape background tetap jalan; lanjut poll.
      continue;
    }
  }
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
  sessionString?: string;
  loginMethod?: string;
}> {
  return withTelegramScrapeSessionLock(sessionId, () =>
    withScrapeWatchdog(
      sessionId,
      () => runTelegramScrapeInner(sessionId, storedSessionString, expectedPhone),
      {
        label: 'Telegram scrape',
        idleMs: scrapeIdleTimeoutMs(DEVICE_GROUP_TARGET_MAX),
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
  sessionString?: string;
  loginMethod?: string;
}> {
  return withTelegramScrapeSessionLock(sessionId, () =>
    withScrapeWatchdog(
      sessionId,
      () => runTelegramScrapeInner(sessionId, storedSessionString, expectedPhone),
      {
        label: 'Telegram auto scrape',
        idleMs: scrapeIdleTimeoutMs(DEVICE_GROUP_TARGET_MAX),
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
  sessionString?: string;
  loginMethod?: string;
}> {
  emitScrapeProgress({ sessionId, phase: 'start' });
  try {
    await ensureSidecarRunning();
  } catch (err) {
    throw toTelegramScrapeError(err);
  }

  const sessionString = storedSessionString?.trim() || null;
  if (sessionString) {
    emitScrapeProgress({ sessionId, phase: 'connect', label: 'Restoring Telegram session' });
    // Heartbeat selama restore panjang — idle watchdog tidak putus diam.
    const restoreHeartbeat = setInterval(() => {
      emitScrapeProgress({
        sessionId,
        phase: 'connect',
        label: 'Restoring Telegram session…',
      });
    }, 15_000);
    try {
      await restoreTelegramSession(sessionId, sessionString);
    } finally {
      clearInterval(restoreHeartbeat);
    }
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
      emitScrapeProgress({ sessionId, phase: 'connect', label: 'Reconnecting Telegram session' });
      await restoreTelegramSession(sessionId, sessionString);
      json = await postTelegramScrape(sessionId, sessionString, expectedPhone);
    }
  } catch (err) {
    emitScrapeProgress({
      sessionId,
      phase: 'error',
      label: toTelegramScrapeError(err).message,
    });
    throw toTelegramScrapeError(err);
  } finally {
    pollUntil.done = true;
    await pollTask.catch(() => undefined);
  }

  if (json.status === 'cancelled') {
    emitScrapeProgress({ sessionId, phase: 'error', label: 'SCRAPER_CANCELLED' });
    throw new Error('SCRAPER_CANCELLED');
  }

  if (json.status === 'error') {
    const raw = json.message ?? 'Telegram scrape failed';
    const message = isTelegramTransportError(new Error(raw)) ? TG_CONNECT_FAILED : raw;
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

  const fromResult = typeof json.sessionString === 'string' ? json.sessionString.trim() : '';
  return {
    ok: true,
    groups: json.groups ?? [],
    count,
    hint: (json as { hint?: string }).hint,
    telegramUser: json.telegramUser,
    elapsedMs: json.elapsedMs,
    sessionString: fromResult || undefined,
    loginMethod: typeof json.loginMethod === 'string' ? json.loginMethod : undefined,
  };
}
