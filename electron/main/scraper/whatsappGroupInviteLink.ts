import type { Client } from 'whatsapp-web.js';

const INVITE_CODE_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [500, 1000, 2000, 3000, 4000];

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

type InviteChat = { getInviteCode?: () => Promise<string> };

/**
 * Ambil invite link WA untuk grup tempat akun adalah admin (`getInviteCode`).
 * Selaras learning scraper — non-admin / gagal → null (bukan placeholder teks).
 */
export async function fetchWhatsAppGroupInviteLink(
  client: Client,
  groupId: string,
): Promise<string | null> {
  const maxAttempts = Math.max(
    1,
    Math.min(6, Math.floor(Number(process.env.RM_WA_INVITE_EXPORT_RETRIES) || 5) + 1),
  );

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const chat = await withTimeout(
        client.getChatById(groupId),
        INVITE_CODE_TIMEOUT_MS,
        'getChatById',
      );
      const getInviteCode = (chat as InviteChat).getInviteCode;
      if (typeof getInviteCode !== 'function') return null;

      const code = await withTimeout(
        getInviteCode.call(chat),
        INVITE_CODE_TIMEOUT_MS,
        'getInviteCode',
      );
      const trimmed = String(code ?? '').trim();
      if (trimmed) return `https://chat.whatsapp.com/${trimmed}`;
      return null;
    } catch {
      if (attempt < maxAttempts - 1) {
        const envSec = Math.max(
          1,
          Math.floor(Number(process.env.RM_WA_INVITE_EXPORT_RETRY_SEC) || 5),
        );
        const delay = RETRY_DELAYS_MS[attempt] ?? envSec * 1000;
        await sleep(delay);
      }
    }
  }

  return null;
}
