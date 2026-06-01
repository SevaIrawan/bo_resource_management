import { useCallback, useEffect, useRef, useState } from 'react';
import { loginQrTimeoutMessage } from '@/lib/platformSyncCopy';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { tryWarmPlatformSession } from '@/lib/warmPlatformSession';
import { withTimeout } from '@/lib/withTimeout';
import type { Platform } from '@/types/database';

const TG_LOGIN_RESTORE_TIMEOUT_MS = 15_000;
const WA_QR_TIMEOUT_MS = 180_000;
const TG_QR_TIMEOUT_MS = 120_000;

export type LoginView = 'qr' | 'phone' | 'code' | '2fa';
export type LoginStatus =
  | 'loading'
  | 'restoring'
  | 'starting-qr'
  | 'idle'
  | 'qr'
  | 'confirming'
  | 'pairing'
  | 'code'
  | '2fa'
  | 'ready'
  | 'error'
  | 'unsupported';

export function usePlatformLogin(
  open: boolean,
  platform: Platform | null,
  /** ID baris UI (`account.id`). */
  sessionId: string,
  defaultPhone = '',
  options?: {
    /** UUID `messaging_accounts` — restore DB / LocalAuth. */
    accountId?: string;
    attemptRestore?: boolean;
    t?: (key: string, vars?: Record<string, string | number>) => string;
  },
) {
  const dbAccountId = options?.accountId ?? sessionId;
  const attemptRestore = options?.attemptRestore !== false;
  const skipDiskRestore = options?.attemptRestore === false;
  const t = options?.t ?? ((key: string) => key);

  const [view, setView] = useState<LoginView>('qr');
  const [status, setStatus] = useState<LoginStatus>('loading');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrGeneration, setQrGeneration] = useState(0);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sessionReadyRef = useRef(false);
  const loginStartedRef = useRef(false);
  const electronSessionIdRef = useRef(sessionId);
  const qrTimeoutIdRef = useRef<number | undefined>(undefined);
  const loginRunIdRef = useRef(0);
  const acceptQrRef = useRef(false);
  const lastQrGenerationRef = useRef(0);
  const prevOpenRef = useRef(false);
  const loginSucceededRef = useRef(false);

  const clearQrTimeout = useCallback(() => {
    if (qrTimeoutIdRef.current !== undefined) {
      window.clearTimeout(qrTimeoutIdRef.current);
      qrTimeoutIdRef.current = undefined;
    }
  }, []);

  const armQrTimeout = useCallback(
    (plat: Platform) => {
      clearQrTimeout();
      const ms = plat === 'whatsapp' ? WA_QR_TIMEOUT_MS : TG_QR_TIMEOUT_MS;
      qrTimeoutIdRef.current = window.setTimeout(() => {
        setStatus((current) => {
          if (
            current === 'ready' ||
            current === 'confirming' ||
            current === 'pairing' ||
            current === 'code' ||
            current === '2fa'
          ) {
            return current;
          }
          if (
            current === 'loading' ||
            current === 'restoring' ||
            current === 'starting-qr' ||
            current === 'qr'
          ) {
            setError(loginQrTimeoutMessage(plat, t));
            return 'error';
          }
          return current;
        });
      }, ms);
    },
    [clearQrTimeout, t],
  );

  // IPC listeners — tetap aktif saat persist setelah ready (modal bisa tutup nanti)
  useEffect(() => {
    if (!platform || !sessionId) return;

    const api = window.electronAPI?.platformLogin;
    if (!api) {
      setStatus('unsupported');
      setError('Login requires the desktop app (Electron).');
      return;
    }

    const matchesSession = (payload: { sessionId: string; platform: Platform }) => {
      if (payload.platform !== platform) return false;
      const electronId = electronSessionIdRef.current;
      return (
        payload.sessionId === electronId ||
        payload.sessionId === sessionId ||
        payload.sessionId === dbAccountId
      );
    };

    const offQr = api.onQr((payload) => {
      if (!matchesSession(payload)) return;
      if (!acceptQrRef.current) return;

      const gen =
        typeof payload.generation === 'number' && payload.generation > 0
          ? payload.generation
          : lastQrGenerationRef.current + 1;
      if (gen <= lastQrGenerationRef.current) return;
      lastQrGenerationRef.current = gen;

      clearQrTimeout();
      setQrGeneration(gen);
      setQrDataUrl(payload.dataUrl);
      setView('qr');
      setStatus('qr');
      setError(null);
      armQrTimeout(platform);
    });

    const offPairing = api.onPairingCode((payload) => {
      if (!matchesSession(payload)) return;
      clearQrTimeout();
      setPairingCode(payload.code);
      setView('phone');
      setStatus('pairing');
      setError(null);
    });

    const offPhase = api.onPhase((payload) => {
      if (!matchesSession(payload)) return;
      if (payload.phase === 'need_code') {
        clearQrTimeout();
        setView('code');
        setStatus('code');
        setError(payload.message ?? null);
      }
      if (payload.phase === 'need_2fa') {
        clearQrTimeout();
        setView('2fa');
        setStatus('2fa');
        setError(payload.message ?? null);
      }
      if (payload.phase === 'confirming') {
        clearQrTimeout();
        setView('qr');
        setStatus('confirming');
        setError(null);
      }
    });

    const offReady = api.onReady((payload) => {
      if (!matchesSession(payload)) return;
      clearQrTimeout();
      sessionReadyRef.current = true;
      loginSucceededRef.current = true;
      setStatus('ready');
      setError(null);
    });

    const offError = api.onError((payload) => {
      if (!matchesSession(payload)) return;
      clearQrTimeout();
      setQrDataUrl(null);
      setStatus('error');
      setError(payload.message ?? 'Login failed');
    });

    return () => {
      offQr();
      offPairing();
      offPhase();
      offReady();
      offError();
    };
  }, [armQrTimeout, clearQrTimeout, dbAccountId, platform, sessionId]);

  // Stuck di "Confirm on phone" tanpa ready — beri jalan keluar.
  useEffect(() => {
    if (!open || status !== 'confirming') return;
    const timeoutId = window.setTimeout(() => {
      setStatus('error');
      setError(
        t?.('groupMonitoring.sync.loginConfirmingTimeout') ??
          'WhatsApp is taking too long to connect. Close this window, wait a few seconds, then tap Sync again.',
      );
    }, 90_000);
    return () => window.clearTimeout(timeoutId);
  }, [open, status, t]);

  // Buka modal baru → reset state (hindari status `ready` lama memicu persist ulang)
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    if (!justOpened || !platform || !sessionId) return;

    loginSucceededRef.current = false;
    sessionReadyRef.current = false;
    loginStartedRef.current = false;
    setView('qr');
    setStatus('loading');
    setQrDataUrl(null);
    setQrGeneration(0);
    setPairingCode(null);
    setError(null);
    setSubmitting(false);
  }, [open, platform, sessionId]);

  // Tutup modal → cancel hanya jika login belum sukses (jangan matikan client untuk scrape)
  useEffect(() => {
    if (open) return;
    const api = window.electronAPI?.platformLogin;
    const hadSucceeded = loginSucceededRef.current;
    if (api && loginStartedRef.current && !hadSucceeded) {
      void api.cancel(electronSessionIdRef.current, platform ?? undefined);
    }
    if (!hadSucceeded) {
      loginStartedRef.current = false;
      sessionReadyRef.current = false;
    }
    clearQrTimeout();
  }, [clearQrTimeout, open, platform]);

  // Start login (tanpa cancel saat StrictMode remount)
  useEffect(() => {
    if (!open || !platform || !sessionId) return;

    const api = window.electronAPI?.platformLogin;
    if (!api) return;

    const runId = ++loginRunIdRef.current;
    loginStartedRef.current = true;
    sessionReadyRef.current = false;

    lastQrGenerationRef.current = 0;
    setView('qr');
    setStatus('starting-qr');
    setQrDataUrl(null);
    setQrGeneration(0);
    setPairingCode(null);
    setError(null);

    void (async () => {
      const isStale = () => loginRunIdRef.current !== runId || !open;

      acceptQrRef.current = true;
      setQrDataUrl(null);
      setQrGeneration(0);
      lastQrGenerationRef.current = 0;
      setStatus('starting-qr');

      const deviceSessionId = await resolveDeviceSessionId({
        sessionId,
        platform,
        accountId: dbAccountId,
      });
      if (isStale()) return;
      electronSessionIdRef.current = deviceSessionId;

      const startQrLogin = () => {
        if (isStale()) return;
        armQrTimeout(platform);
        void api
          .start({
            sessionId: deviceSessionId,
            platform,
            mode: 'qr',
            skipDiskRestore,
          })
          .catch((err: unknown) => {
            if (isStale()) return;
            clearQrTimeout();
            setStatus('error');
            setError(err instanceof Error ? err.message : 'Failed to start login');
          });
      };

      if (platform === 'whatsapp' && skipDiskRestore) {
        try {
          await api.release(deviceSessionId, { purgeWaDisk: true });
        } catch {
          // ignore
        }
        if (isStale()) return;
        startQrLogin();
        return;
      }

      // Restore dulu — jangan start QR paralel (dua Puppeteer = macet di "Confirm on phone").
      if (attemptRestore) {
        setStatus('restoring');
        acceptQrRef.current = false;
        try {
          const warmed = await withTimeout(
            tryWarmPlatformSession({
              sessionId,
              platform,
              accountId: dbAccountId,
            }),
            TG_LOGIN_RESTORE_TIMEOUT_MS,
            'Restore session',
          );
          if (isStale()) return;
          if (warmed) {
            sessionReadyRef.current = true;
            loginSucceededRef.current = true;
            setStatus('ready');
            return;
          }
        } catch {
          if (isStale()) return;
        }
        acceptQrRef.current = true;
        setStatus('starting-qr');
      }

      startQrLogin();
    })().catch((err: unknown) => {
      if (loginRunIdRef.current !== runId) return;
      clearQrTimeout();
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to start login');
    });

    return () => {
      clearQrTimeout();
    };
  }, [
    armQrTimeout,
    attemptRestore,
    clearQrTimeout,
    dbAccountId,
    open,
    platform,
    sessionId,
    skipDiskRestore,
  ]);

  const switchToPhoneForm = useCallback(async () => {
    const api = window.electronAPI?.platformLogin;
    if (!api || !platform) return;

    setSubmitting(true);
    setError(null);
    try {
      sessionReadyRef.current = false;
      await api.cancel(electronSessionIdRef.current, platform);
      setView('phone');
      setStatus('idle');
      setQrDataUrl(null);
      setPairingCode(null);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to switch to phone login');
    } finally {
      setSubmitting(false);
    }
  }, [platform]);

  const switchToQr = useCallback(async () => {
    const api = window.electronAPI?.platformLogin;
    if (!api || !platform) return;

    setSubmitting(true);
    setError(null);
    try {
      sessionReadyRef.current = false;
      acceptQrRef.current = true;
      setView('qr');
      setQrDataUrl(null);
      setQrGeneration(0);
      lastQrGenerationRef.current = 0;
      await api.cancel(electronSessionIdRef.current, platform);
      loginRunIdRef.current += 1;
      const deviceSessionId = await resolveDeviceSessionId({
        sessionId,
        platform,
        accountId: dbAccountId,
      });
      electronSessionIdRef.current = deviceSessionId;
      if (platform === 'whatsapp') {
        try {
          await api.release(deviceSessionId, { purgeWaDisk: true });
        } catch {
          // ignore
        }
      }
      setStatus('starting-qr');
      armQrTimeout(platform);
      loginStartedRef.current = true;
      void api.start({
        sessionId: deviceSessionId,
        platform,
        mode: 'qr',
        skipDiskRestore: platform === 'whatsapp',
      });
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to switch to QR login');
    } finally {
      setSubmitting(false);
    }
  }, [armQrTimeout, dbAccountId, platform, sessionId]);

  const startPhoneLogin = useCallback(
    async (phone: string) => {
      const api = window.electronAPI?.platformLogin;
      if (!api || !platform) return;

      setSubmitting(true);
      setError(null);
      try {
        sessionReadyRef.current = false;
        const deviceSessionId = await resolveDeviceSessionId({
          sessionId,
          platform,
          accountId: dbAccountId,
        });
        electronSessionIdRef.current = deviceSessionId;
        await api.cancel(deviceSessionId, platform);
        setView('phone');
        setStatus('loading');
        setQrDataUrl(null);
        setPairingCode(null);
        loginStartedRef.current = true;
        await api.start({ sessionId: deviceSessionId, platform, mode: 'phone', phone });
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Phone login failed');
      } finally {
        setSubmitting(false);
      }
    },
    [dbAccountId, platform, sessionId],
  );

  const submitCode = useCallback(
    async (code: string) => {
      const api = window.electronAPI?.platformLogin;
      if (!api || !platform) return;

      setSubmitting(true);
      setError(null);
      try {
        await api.submit({
          sessionId: electronSessionIdRef.current,
          platform,
          kind: 'code',
          value: code,
        });
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Invalid login code');
      } finally {
        setSubmitting(false);
      }
    },
    [platform],
  );

  const submit2fa = useCallback(
    async (password: string) => {
      const api = window.electronAPI?.platformLogin;
      if (!api || !platform) return;

      setSubmitting(true);
      setError(null);
      try {
        await api.submit({
          sessionId: electronSessionIdRef.current,
          platform,
          kind: '2fa',
          value: password,
        });
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Invalid 2FA password');
      } finally {
        setSubmitting(false);
      }
    },
    [platform],
  );

  return {
    view,
    status,
    qrDataUrl,
    qrGeneration,
    pairingCode,
    error,
    submitting,
    defaultPhone,
    switchToQr,
    switchToPhoneForm,
    startPhoneLogin,
    submitCode,
    submit2fa,
  };
}
