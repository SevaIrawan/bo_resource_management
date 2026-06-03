import type { Client } from 'whatsapp-web.js';
import { DEVICE_GROUP_TARGET_MAX, WA_STORE_GROUP_LIST_CAP } from './deviceGroupScale';

const WA_STORE_WAIT_MS = 120_000;
const WA_STORE_POLL_MS = 250;

async function isWWebJsReady(client: Client): Promise<boolean> {
  if (!client.pupPage) return false;
  try {
    return await client.pupPage.evaluate(
      () =>
        typeof window.WWebJS !== 'undefined' &&
        typeof window.WWebJS.getChat === 'function' &&
        typeof window.require === 'function',
    );
  } catch {
    return false;
  }
}

/** Tunggu injeksi WWebJS (setelah event `ready` / sync WA Web). */
export async function waitForWhatsAppStoreReady(client: Client): Promise<void> {
  const deadline = Date.now() + WA_STORE_WAIT_MS;

  while (Date.now() < deadline) {
    if (await isWWebJsReady(client)) return;

    const state = await client.getState().catch(() => null);
    if (state && state !== 'CONNECTED') {
      throw new Error(`WA_NOT_CONNECTED: WhatsApp is not connected (${state}). Log in again.`);
    }

    await new Promise<void>((resolve) => {
      const done = () => {
        client.off('ready', done);
        resolve();
      };
      client.once('ready', done);
      setTimeout(done, WA_STORE_POLL_MS);
    });
  }

  if (await isWWebJsReady(client)) return;

  throw new Error(
    'WA_STORE_NOT_READY: WhatsApp Web masih sync. Tunggu hingga login selesai (beberapa detik), lalu jalankan scraper lagi.',
  );
}

export function assertWhatsAppScrapeClient(client: Client | null | undefined): asserts client is Client {
  if (!client) {
    throw new Error('WA_CLIENT_NOT_READY: WhatsApp client lost during scrape. Log in again.');
  }
  if (!client.pupPage) {
    throw new Error(
      'WA_CLIENT_NOT_READY: WhatsApp browser session not initialized. Wait for login to finish.',
    );
  }
  if (typeof client.getChatById !== 'function') {
    throw new Error('WA_CLIENT_NOT_READY: WhatsApp client API unavailable. Try again.');
  }
}

/** Daftar JID grup dari store WA Web — tanpa `client.getChats()`. */
export async function listWhatsAppGroupIds(client: Client): Promise<string[]> {
  assertWhatsAppScrapeClient(client);
  await waitForWhatsAppStoreReady(client);

  const ids = await client.pupPage.evaluate(async () => {
    const chats = window.require('WAWebCollections').Chat.getModelsArray();
    const getters = window.require('WAWebContactGetters');
    const out: string[] = [];
    for (const chat of chats) {
      const isGroup = getters.getIsGroup(chat) || Boolean(chat.groupMetadata);
      if (!isGroup) continue;
      const serialized = chat.id?._serialized;
      if (serialized) out.push(serialized);
    }
    return out;
  });

  const unique = Array.from(new Set(ids));
  if (unique.length > WA_STORE_GROUP_LIST_CAP) {
    console.warn(
      `[wa-groups] ${unique.length} groups on device; capping list at ${WA_STORE_GROUP_LIST_CAP}`,
    );
    return unique.slice(0, WA_STORE_GROUP_LIST_CAP);
  }

  if (unique.length > DEVICE_GROUP_TARGET_MAX) {
    console.info(
      `[wa-groups] Large account: ${unique.length} groups (prepared for up to ${DEVICE_GROUP_TARGET_MAX}+)`,
    );
  }

  return unique;
}
