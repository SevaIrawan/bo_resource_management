import type { Client } from 'whatsapp-web.js';
import { assertWhatsAppScrapeClient } from './whatsappGroupDiscovery';

const INVITE_CODE_TIMEOUT_MS = 20_000;
const RETRY_DELAYS_MS = [800, 1500, 2500, 4000, 6000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizeInviteCode(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    const fromUrl = t.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
    if (fromUrl?.[1]) return fromUrl[1];
    if (/^[A-Za-z0-9_-]{8,}$/.test(t)) return t;
    return null;
  }
  if (typeof raw === 'object') {
    const o = raw as { code?: unknown; inviteCode?: unknown };
    return normalizeInviteCode(o.code ?? o.inviteCode ?? null);
  }
  return null;
}

/**
 * Export invite lewat WA Web store (sama sumber GroupChat.getInviteCode di wwebjs 1.34),
 * tanpa bergantung `getChatById` mengembalikan GroupChat (sering Chat polos → getInviteCode undefined).
 */
async function fetchInviteCodeFromStore(client: Client, groupId: string): Promise<string | null> {
  assertWhatsAppScrapeClient(client);

  return client.pupPage.evaluate(async (gid: string) => {
    function pickCode(raw: unknown): string | null {
      if (raw == null) return null;
      if (typeof raw === 'string') {
        const t = raw.trim();
        if (!t) return null;
        const m = t.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
        if (m?.[1]) return m[1];
        if (/^[A-Za-z0-9_-]{8,}$/.test(t)) return t;
        return null;
      }
      if (typeof raw === 'object') {
        const o = raw as { code?: unknown; inviteCode?: unknown };
        return pickCode(o.code ?? o.inviteCode ?? null);
      }
      return null;
    }

    try {
      const GroupQueryJob = window.require('WAWebGroupQueryJob') as {
        queryAndUpdateGroupMetadataById?: (input: { id: string }) => Promise<unknown> | unknown;
      };
      const q = GroupQueryJob.queryAndUpdateGroupMetadataById?.({ id: gid });
      if (q && typeof (q as Promise<unknown>).then === 'function') await q;
    } catch {
      // optional refresh
    }

    // Primary — wwebjs 1.34 GroupChat.getInviteCode
    try {
      const mex = window.require('WAWebMexFetchGroupInviteCodeJob') as {
        fetchMexGroupInviteCode?: (id: string) => Promise<unknown>;
      };
      if (typeof mex.fetchMexGroupInviteCode === 'function') {
        const res = await mex.fetchMexGroupInviteCode(gid);
        const code = pickCode(res);
        if (code) return code;
      }
    } catch (err) {
      const name = err && typeof err === 'object' ? String((err as { name?: string }).name) : '';
      if (name && name !== 'ServerStatusCodeError') {
        // continue fallbacks
      }
    }

    // Legacy Store.GroupInvite
    try {
      const WidFactory = window.require('WAWebWidFactory') as {
        createWid: (id: string) => unknown;
      };
      const wid = WidFactory.createWid(gid);
      const GroupInvite = window.require('WAWebGroupInvite') as {
        queryGroupInviteCode?: (wid: unknown) => Promise<unknown>;
      };
      if (typeof GroupInvite.queryGroupInviteCode === 'function') {
        const res = await GroupInvite.queryGroupInviteCode(wid);
        const code = pickCode(res);
        if (code) return code;
      }
    } catch {
      // continue
    }

    // Some builds expose invite on group metadata after refresh
    try {
      if (typeof window.WWebJS?.getChat === 'function') {
        const chat = (await window.WWebJS.getChat(gid, { getAsModel: false })) as {
          groupMetadata?: { inviteCode?: string; groupInviteLink?: string };
        } | null;
        const code = pickCode(
          chat?.groupMetadata?.inviteCode ?? chat?.groupMetadata?.groupInviteLink ?? null,
        );
        if (code) return code;
      }
    } catch {
      // continue
    }

    return null;
  }, groupId);
}

async function fetchInviteCodeViaGroupChatApi(
  client: Client,
  groupId: string,
): Promise<string | null> {
  type InviteChat = {
    isGroup?: boolean;
    getInviteCode?: () => Promise<unknown>;
  };

  const chat = (await withTimeout(
    client.getChatById(groupId),
    INVITE_CODE_TIMEOUT_MS,
    'getChatById',
  )) as InviteChat;

  if (typeof chat.getInviteCode !== 'function') {
    return null;
  }

  const raw = await withTimeout(chat.getInviteCode(), INVITE_CODE_TIMEOUT_MS, 'getInviteCode');
  return normalizeInviteCode(raw);
}

/**
 * Ambil invite link WA untuk grup tempat akun adalah admin.
 * Non-admin / gagal → null (bukan placeholder). Error di-log — jangan gagal diam-diam.
 */
export async function fetchWhatsAppGroupInviteLink(
  client: Client,
  groupId: string,
): Promise<string | null> {
  const maxAttempts = Math.max(
    1,
    Math.min(6, Math.floor(Number(process.env.RM_WA_INVITE_EXPORT_RETRIES) || 5) + 1),
  );

  let lastError = '';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      // 1) Store/Mex langsung — konsisten dengan is_admin dari store scrape
      const fromStore = await withTimeout(
        fetchInviteCodeFromStore(client, groupId),
        INVITE_CODE_TIMEOUT_MS,
        'inviteFromStore',
      );
      if (fromStore) return `https://chat.whatsapp.com/${fromStore}`;

      // 2) API GroupChat bila instance benar
      const fromApi = await fetchInviteCodeViaGroupChatApi(client, groupId);
      if (fromApi) return `https://chat.whatsapp.com/${fromApi}`;

      lastError = 'empty_invite_code';
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(
        `[wa-invite] ${groupId} attempt ${attempt + 1}/${maxAttempts}: ${lastError}`,
      );
    }

    if (attempt < maxAttempts - 1) {
      const envSec = Math.max(
        1,
        Math.floor(Number(process.env.RM_WA_INVITE_EXPORT_RETRY_SEC) || 5),
      );
      const delay = RETRY_DELAYS_MS[attempt] ?? envSec * 1000;
      await sleep(delay);
    }
  }

  console.warn(`[wa-invite] FAILED ${groupId}: ${lastError || 'unknown'}`);
  return null;
}
