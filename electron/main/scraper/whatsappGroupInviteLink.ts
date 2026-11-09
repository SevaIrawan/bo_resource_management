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

/** Modul invite WA Web yang sejak ~Sep 2026 tidak dimuat saat boot (lazy bundle). */
const WA_INVITE_LAZY_MODULE = 'WAWebMexFetchGroupInviteCodeJob';

type InviteFetchResult = {
  code: string | null;
  /** false = modul invite tidak bisa dimuat → retry per grup tidak berguna. */
  moduleReady: boolean;
  /** Ringkasan tiap langkah in-page (error asli, bukan ditelan). */
  diag: string;
};

/**
 * Export invite lewat WA Web store/Mex/page saja.
 * Tidak serialize chat penuh ke Node (hindari Error "r").
 *
 * WA Web >= 2.3000 memuat `WAWebMexFetchGroupInviteCodeJob` hanya saat drawer
 * "Invite via link" dibuka (lazy resource bundle). Sesi headless tidak pernah
 * membuka drawer itu → `window.require` mengembalikan undefined. Sebelum fetch,
 * minta Bootloader WA memuat bundle-nya (komponen `WAWebGroupInviteLinkDrawer.react`)
 * — pendekatan sama dengan wa-js `ensureLazyModule` (PR #3654, merged 2026-09-26).
 */
async function fetchInviteCodeFromStore(client: Client, groupId: string): Promise<InviteFetchResult> {
  assertWhatsAppScrapeClient(client);
  if (!client.pupPage) {
    throw new Error('WA_CLIENT_NOT_READY: WhatsApp browser session not initialized. Wait for login to finish.');
  }

  return client.pupPage.evaluate(
    async (gid: string, lazyModuleId: string) => {
      const steps: string[] = [];
      const errText = (step: string, e: unknown): string => {
        const name = e instanceof Error ? e.name : typeof e;
        const msg = e instanceof Error ? e.message : String(e);
        return `${step}:${name}:${msg}`.slice(0, 200);
      };

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

      const req = window.require;
      const isRegistered = (moduleId: string): boolean => {
        try {
          return Boolean(req?.(moduleId));
        } catch {
          return false;
        }
      };

      /** Muat lazy bundle lewat Bootloader WA (best-effort, cache gagal 5 menit per halaman). */
      async function ensureLazyModule(moduleId: string): Promise<boolean> {
        if (isRegistered(moduleId)) return true;

        const w = window as unknown as { __gmInviteLazyFailAt?: number };
        if (w.__gmInviteLazyFailAt && Date.now() - w.__gmInviteLazyFailAt < 5 * 60 * 1000) {
          steps.push('lazy:skip-recent-fail');
          return false;
        }

        let bootloader:
          | {
              loadModules: (c: string[], cb: () => void, ctx: string) => unknown;
              __debug?: { componentMap?: Map<string, unknown> };
            }
          | undefined;
        try {
          const mod = req?.('Bootloader');
          bootloader = typeof mod?.loadModules === 'function' ? mod : mod?.default;
        } catch (e) {
          steps.push(errText('lazy:bootloader', e));
        }
        if (!bootloader || typeof bootloader.loadModules !== 'function') {
          steps.push('lazy:bootloader-unavailable');
          w.__gmInviteLazyFailAt = Date.now();
          return false;
        }

        const preferred = ['WAWebGroupInviteLinkDrawer.react'];
        const componentMap = bootloader.__debug?.componentMap;
        const candidates =
          componentMap && typeof componentMap.has === 'function'
            ? preferred.filter((n) => componentMap.has(n))
            : [...preferred];
        if (componentMap && typeof componentMap.keys === 'function') {
          let discovered = 0;
          for (const name of componentMap.keys()) {
            if (discovered >= 4) break;
            if (/GroupInvite/i.test(name) && !candidates.includes(name)) {
              candidates.push(name);
              discovered += 1;
            }
          }
        }

        for (const component of candidates) {
          try {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error('bootload timeout 15s')), 15_000);
              try {
                bootloader!.loadModules(
                  [component],
                  () => {
                    clearTimeout(timer);
                    resolve();
                  },
                  'GM',
                );
              } catch (e) {
                clearTimeout(timer);
                reject(e);
              }
            });
          } catch (e) {
            steps.push(errText(`lazy:${component}`, e));
            continue;
          }
          if (isRegistered(moduleId)) {
            steps.push(`lazy:loaded-via:${component}`);
            return true;
          }
          steps.push(`lazy:${component}:loaded-but-missing`);
        }

        const ok = isRegistered(moduleId);
        if (!ok) {
          steps.push(`lazy:not-registered(candidates=${candidates.length})`);
          w.__gmInviteLazyFailAt = Date.now();
        }
        return ok;
      }

      try {
        const GroupQueryJob = req?.('WAWebGroupQueryJob') as {
          queryAndUpdateGroupMetadataById?: (input: { id: string }) => Promise<unknown> | unknown;
        };
        const q = GroupQueryJob?.queryAndUpdateGroupMetadataById?.({ id: gid });
        if (q && typeof (q as Promise<unknown>).then === 'function') await q;
      } catch (e) {
        steps.push(errText('refresh', e));
      }

      const moduleReady = await ensureLazyModule(lazyModuleId);

      try {
        const mex = req?.(lazyModuleId) as {
          fetchMexGroupInviteCode?: (id: string) => Promise<unknown>;
        };
        if (typeof mex?.fetchMexGroupInviteCode === 'function') {
          const res = await mex.fetchMexGroupInviteCode(gid);
          const code = pickCode(res);
          if (code) return { code, moduleReady: true, diag: steps.join(' | ') };
          steps.push(`mex:empty(${res === null ? 'null' : typeof res})`);
        } else {
          steps.push('mex:module-missing');
        }
      } catch (e) {
        steps.push(errText('mex', e));
      }

      try {
        const WidFactory = req?.('WAWebWidFactory') as {
          createWid: (id: string) => unknown;
        };
        const wid = WidFactory.createWid(gid);
        const GroupInvite = req?.('WAWebGroupInvite') as {
          queryGroupInviteCode?: (wid: unknown) => Promise<unknown>;
        };
        if (typeof GroupInvite?.queryGroupInviteCode === 'function') {
          const res = await GroupInvite.queryGroupInviteCode(wid);
          const code = pickCode(res);
          if (code) return { code, moduleReady: true, diag: steps.join(' | ') };
          steps.push('groupInvite:empty');
        } else {
          steps.push('groupInvite:module-missing');
        }
      } catch (e) {
        steps.push(errText('groupInvite', e));
      }

      try {
        if (typeof window.WWebJS?.getChat === 'function') {
          const chat = (await window.WWebJS.getChat(gid, { getAsModel: false })) as {
            groupMetadata?: { inviteCode?: string; groupInviteLink?: string };
          } | null;
          const code = pickCode(
            chat?.groupMetadata?.inviteCode ?? chat?.groupMetadata?.groupInviteLink ?? null,
          );
          if (code) return { code, moduleReady: true, diag: steps.join(' | ') };
          steps.push('chatMeta:empty');
        }
      } catch (e) {
        steps.push(errText('chatMeta', e));
      }

      return { code: null, moduleReady, diag: steps.join(' | ') };
    },
    groupId,
    WA_INVITE_LAZY_MODULE,
  );
}

/** Log "modul invite tidak tersedia" sekali per client (hindari spam ribuan baris). */
const loggedModuleUnavailable = new WeakSet<object>();

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
      const res = await withTimeout(
        fetchInviteCodeFromStore(client, groupId),
        INVITE_CODE_TIMEOUT_MS + 90_000,
        'inviteFromStore',
      );
      if (res.code) {
        if (res.diag) console.info(`[wa-invite] ${groupId} ok (${res.diag})`);
        return `https://chat.whatsapp.com/${res.code}`;
      }
      if (!res.moduleReady) {
        if (!loggedModuleUnavailable.has(client)) {
          loggedModuleUnavailable.add(client);
          console.warn(
            `[wa-invite] WA_INVITE_MODULE_UNAVAILABLE ${groupId}: ${res.diag || 'no detail'} — retry per grup dilewati`,
          );
        }
        return null;
      }
      lastError = `empty_invite_code (${res.diag || 'no detail'})`;
      console.warn(`[wa-invite] ${groupId} attempt ${attempt + 1}/${maxAttempts}: ${lastError}`);
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
