import {
  resolveLiveWhatsAppSessionId,
  withLiveWhatsAppLoginClient,
  withWhatsAppClient,
} from '../platformLogin/whatsapp';
import { isCountAborted } from './countGroupsCancel';
import {
  assertWhatsAppScrapeClient,
  countWhatsAppGroupsOnDevice,
  listWhatsAppGroupIds,
} from './whatsappGroupDiscovery';
import { scrapeWhatsAppGroupFromStore } from './whatsappGroupScrapeStore';
import {
  DEVICE_GROUP_TARGET_MAX,
  QUICK_COUNT_STORE_WAIT_MS,
  runPooled,
  WA_SCRAPE_METADATA_CONCURRENCY,
} from './deviceGroupScale';
import { emitScrapeProgress } from './scrapeProgress';

async function countFromConnectedClient(
  sessionId: string,
  client: Parameters<typeof assertWhatsAppScrapeClient>[0],
  mode: 'quick' | 'full',
  options?: { reuseLiveLogin?: boolean },
): Promise<{
  valid: boolean;
  totalGroups: number;
  adminGroups: number;
  groupIds?: string[];
  message?: string;
}> {
  assertWhatsAppScrapeClient(client);

  const state = await client.getState();
  if (state !== 'CONNECTED') {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: 'WhatsApp session is not connected',
    };
  }

  emitScrapeProgress({
    sessionId,
    phase: 'discover',
    label: 'Reading group list from WhatsApp…',
  });

  if (isCountAborted(sessionId)) {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: 'COUNT_CANCELLED',
    };
  }

  const storeWaitMs = mode === 'quick' ? QUICK_COUNT_STORE_WAIT_MS : undefined;

  if (mode === 'quick') {
    const totalGroups = await countWhatsAppGroupsOnDevice(client, { storeWaitMs });
    emitScrapeProgress({
      sessionId,
      phase: 'discover',
      current: totalGroups,
      total: totalGroups,
      label: `${totalGroups} groups on device`,
    });
    return {
      valid: true,
      totalGroups,
      adminGroups: 0,
    };
  }

  const groupIds = await listWhatsAppGroupIds(client, { storeWaitMs });
  const totalGroups = groupIds.length;

  emitScrapeProgress({
    sessionId,
    phase: 'discover',
    current: totalGroups,
    total: totalGroups,
    label: `${totalGroups} groups on device`,
  });

  const scanIds = groupIds.slice(0, DEVICE_GROUP_TARGET_MAX);

  const adminFlags = await runPooled(scanIds, WA_SCRAPE_METADATA_CONCURRENCY, async (groupId, index) => {
    const core = await scrapeWhatsAppGroupFromStore(client, groupId);
    if ('skip' in core) return false;

    if ((index + 1) % 25 === 0 || index === scanIds.length - 1) {
      emitScrapeProgress({
        sessionId,
        phase: 'group',
        current: index + 1,
        total: scanIds.length,
        label: `Checking admin role (${index + 1}/${scanIds.length})…`,
      });
    }

    return core.is_admin === 'yes';
  });

  const adminGroups = adminFlags.filter(Boolean).length;

  return {
    valid: true,
    totalGroups,
    adminGroups,
    groupIds,
  };
}

async function countWhatsAppGroupsInner(
  sessionId: string,
  mode: 'quick' | 'full',
  options?: { reuseLiveLogin?: boolean },
): Promise<{
  valid: boolean;
  totalGroups: number;
  adminGroups: number;
  groupIds?: string[];
  message?: string;
}> {
  if (mode === 'quick') {
    const liveId = await resolveLiveWhatsAppSessionId(sessionId);
    if (liveId) {
      try {
        return await withLiveWhatsAppLoginClient(liveId, (client) =>
          countFromConnectedClient(liveId, client, mode, options),
        );
      } catch {
        // fallback cold-boot di bawah
      }
    }
  } else if (options?.reuseLiveLogin) {
    const liveId = await resolveLiveWhatsAppSessionId(sessionId);
    if (liveId) {
      return withLiveWhatsAppLoginClient(liveId, (client) =>
        countFromConnectedClient(liveId, client, mode, options),
      );
    }
  }

  const clientOpts =
    mode === 'quick'
      ? { storeWaitMs: QUICK_COUNT_STORE_WAIT_MS, readyTimeoutMs: 30_000 }
      : undefined;

  return withWhatsAppClient(
    sessionId,
    (client) => countFromConnectedClient(sessionId, client, mode, options),
    clientOpts,
  );
}

/** Setelah login / sync — hitung total grup dari store (satu pass, tidak skala scrape). */
export async function countWhatsAppGroupsQuick(
  sessionId: string,
  options?: { reuseLiveLogin?: boolean },
): Promise<{
  valid: boolean;
  totalGroups: number;
  adminGroups: number;
  groupIds?: string[];
  message?: string;
}> {
  try {
    return await countWhatsAppGroupsInner(sessionId, 'quick', options);
  } catch (error) {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: error instanceof Error ? error.message : 'WhatsApp count failed',
    };
  }
}

/** Sync manual penuh — total dari store + admin paralel (maks DEVICE_GROUP_TARGET_MAX). */
export async function countWhatsAppGroups(sessionId: string): Promise<{
  valid: boolean;
  totalGroups: number;
  adminGroups: number;
  groupIds?: string[];
  message?: string;
}> {
  try {
    return await countWhatsAppGroupsInner(sessionId, 'full');
  } catch (error) {
    return {
      valid: false,
      totalGroups: 0,
      adminGroups: 0,
      message: error instanceof Error ? error.message : 'WhatsApp count failed',
    };
  }
}
