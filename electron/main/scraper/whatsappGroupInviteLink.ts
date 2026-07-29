import type { Client } from 'whatsapp-web.js';
import { assertWhatsAppScrapeClient } from './whatsappGroupDiscovery';

const INVITE_CODE_TIMEOUT_MS = 20_000;
const RETRY_DELAYS_MS = [800, 1500, 2500, 4000, 6000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out`));
    }, ms);
    void promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Export invite lewat WA Web store/Mex/page saja.
 * Tidak serialize chat penuh ke Node (hindari Error "r").
 */
async function fetchInviteCodeFromStore(client: Client, groupId: string): Promise<string | null> {
  assertWhatsAppScrapeClient(client);
  if (!client.pupPage) {
    throw new Error('WA_CLIENT_NOT_READY: WhatsApp browser session not initialized. Wait for login to finish.');
  }

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

    try {
      const mex = window.require('WAWebMexFetchGroupInviteCodeJob') as {
        fetchMexGroupInviteCode?: (id: string) => Promise<unknown>;
      };
      if (typeof mex.fetchMexGroupInviteCode === 'function') {
        const res = await mex.fetchMexGroupInviteCode(gid);
        const code = pickCode(res);
        if (code) return code;
      }
    } catch {
      // continue fallbacks in-page
    }

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

/**
 * Ambil invite link WA untuk grup tempat akun adalah admin.
 * Hanya store/page di browser. Gagal → null.
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
      const fromStore = await withTimeout(
        fetchInviteCodeFromStore(client, groupId),
        INVITE_CODE_TIMEOUT_MS,
        'inviteFromStore',
      );
      if (fromStore) return `https://chat.whatsapp.com/${fromStore}`;
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
