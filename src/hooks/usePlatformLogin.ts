import { useCallback, useEffect, useRef, useState } from 'react';
import { loginQrTimeoutMessage } from '@/lib/platformSyncCopy';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { tryWarmPlatformSession } from '@/lib/warmPlatformSession';
import { withTimeout } from '@/lib/withTimeout';
import type { Platform } from '@/types/database';

const TG_LOGIN_RESTORE_TIMEOUT_MS = 12_000;
/** Setelah Chromium mulai, tunggu event QR (bukan 24 jam — maks ~2 menit). */
const WA_QR_TIMEOUT_MS = 120_000;
const DEFAULT_QR_TIMEOUT_MS = 45_000;

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
  sessionId: string,
  defaultPhone = '',
  options?: {
    accountId?: string;
    attemptRestore?: boolean;
    t?: (key: string, vars?: Record<string, string | number>) => string;
  },
) {
  const accountId = options?.accountId ?? sessionId;
  const attemptRestore = options?.attemptRestore !== false;
  const skipDiskRestore = options?.attemptRestore === false;
  const t = options?.t ?? ((key: string) => key);
  const [view, setView] = useState<LoginView>('qr');
  const [status, setStatus] = useState<LoginStatus>('loading');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const sessionReadyRef = useRef(false);
  const loginStartedRef = useRef(false);
  const electronSessionIdRef = useRef(sessionId);
  const qrTimeoutIdRef = useRef<number | undefined>(undefined);

  electronSessionIdRef.current = sessionId;

  const clearQrTimeout = useCallback(() => {
    if (qrTimeoutIdRef.current !== undefined) {
      window.clearTimeout(qrTimeoutIdRef.current);
      qrTimeoutIdRef.current = undefined;
    }
  }, []);

  const reset = useCallback(() => {
    setView('qr');
    setStatus('loading');
    setQrDataUrl(null);
    setPairingCode(null);
    setError(null);
    setSubmitting(false);
    sessionReadyRef.current = false;
    loginStartedRef.current = false;
  }, []);

  // IPC listeners — tidak membatalkan session saat remount (React Strict Mode)
  useEffect(() => {
    if (!open || !platform || !sessionId) return;

    const api = window.electronAPI?.platformLogin;
    if (!api) {
      setStatus('unsupported');
      setError('Login requires the desktop app (Electron).');
      return;
    }

    const matchesSession = (payload: { sessionId: string; platform: Platform }) => {
      if (payload.platform !== platform) return false;
      const electronId = electronSessionIdRef.current;
      return payload.sessionId === electronId || payload.sessionId === sessionId;
    };

    const offQr = api.onQr((payload) => {
      if (!matchesSession(payload)) return;
      setQrDataUrl(payload.dataUrl);
      setView('qr');
      setStatus('qr');
      setError(null);
    });

    const offPairing = api.onPairingCode((payload) => {
      if (!matchesSession(payload)) return;
      setPairingCode(payload.code);
      setView('phone');
      setStatus('pairing');
      setError(null);
    });

    const offPhase = api.onPhase((payload) => {
      if (!matchesSession(payload)) return;
      if (payload.phase === 'need_code') {
        setView('code');
        setStatus('code');
        setError(payload.message ?? null);
      }
      if (payload.phase === 'need_2fa') {
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
  }, [clearQrTimeout, open, platform, sessionId]);

  // Start / cancel login — cancel hanya saat modal ditutup
  useEffect(() => {
    if (!open || !platform || !sessionId) {
      if (!open && loginStartedRef.current && !sessionReadyRef.current) {
        const api = window.electronAPI?.platformLogin;
        if (api) {
          void api.cancel(electronSessionIdRef.current);
        }
      }
      if (!open) {
        loginStartedRef.current = false;
        sessionReadyRef.current = false;
      }
      return;
    }

    const api = window.electronAPI?.platformLogin;
    if (!api) return;

    // Scan sudah sukses — jangan start QR lagi (hindari cancel session di sidecar).
    if (sessionReadyRef.current) return;

    reset();
    loginStartedRef.current = true;
    sessionReadyRef.current = false;

    let cancelled = false;

    void (async () => {
      setStatus('loading');
      setError(null);
      const deviceSessionId = await resolveDeviceSessionId({
        sessionId,
        platform,
        accountId,
      });
      if (cancelled) return;
      electronSessionIdRef.current = deviceSessionId;

      // Telegram: coba restore string DB dulu. WA: langsung ke Electron (hindari double restore 90s+45s).
      if (attemptRestore && platform === 'telegram') {
        setStatus('restoring');
        try {
          const warmed = await withTimeout(
            tryWarmPlatformSession({
              sessionId,
              platform,
              accountId,
            }),
            TG_LOGIN_RESTORE_TIMEOUT_MS,
            'Restore session',
          );
          if (cancelled) return;
          if (warmed) {
            sessionReadyRef.current = true;
            setStatus('ready');
            return;
          }
        } catch {
          // lanjut ke QR
        }
      }

      if (cancelled) return;

      // Session invalid / logout: buang client + cache disk supaya QR tidak hang di restore lama.
      if (platform === 'whatsapp' && skipDiskRestore) {
        try {
          await api.cancel(deviceSessionId);
          await api.release(deviceSessionId, { purgeWaDisk: true });
        } catch {
          // lanjut — Electron start juga clear disk
        }
      }

      if (cancelled) return;

      setStatus('starting-qr');

      const qrTimeoutMs =
        platform === 'whatsapp' ? WA_QR_TIMEOUT_MS : DEFAULT_QR_TIMEOUT_MS;
      clearQrTimeout();
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
            setError(loginQrTimeoutMessage(platform, t));
            return 'error';
          }
          return current;
        });
      }, qrTimeoutMs);

      // Jangan await initialize Chromium — QR dikirim lewat IPC saat siap.
      void api
        .start({
          sessionId: deviceSessionId,
          platform,
          mode: 'qr',
          skipDiskRestore: skipDiskRestore,
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setStatus('error');
          setError(err instanceof Error ? err.message : 'Failed to start login');
        });
    })().catch((err: unknown) => {
      if (cancelled) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to start login');
    });

    return () => {
      cancelled = true;
      clearQrTimeout();
    };
  }, [
    accountId,
    attemptRestore,
    clearQrTimeout,
    open,
    platform,
    sessionId,
    reset,
    skipDiskRestore,
    t,
  ]);

  const switchToPhoneForm = useCallback(async () => {
    const api = window.electronAPI?.platformLogin;
    if (!api) return;

    setSubmitting(true);
    setError(null);
    try {
      sessionReadyRef.current = false;
      await api.cancel(sessionId);
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
  }, [sessionId]);

  const switchToQr = useCallback(async () => {
    const api = window.electronAPI?.platformLogin;
    if (!api || !platform) return;

    setSubmitting(true);
    setError(null);
    try {
      sessionReadyRef.current = false;
      await api.cancel(electronSessionIdRef.current);
      reset();
      loginStartedRef.current = true;
      const deviceSessionId = await resolveDeviceSessionId({
        sessionId,
        platform,
        accountId,
      });
      electronSessionIdRef.current = deviceSessionId;
      if (platform === 'whatsapp') {
        try {
          await api.cancel(deviceSessionId);
          await api.release(deviceSessionId, { purgeWaDisk: true });
        } catch {
          // ignore
        }
      }
      setStatus('starting-qr');
      void api.start({
        sessionId: deviceSessionId,
        platform,
        mode: 'qr',
        skipDiskRestore: platform === 'whatsapp' ? true : skipDiskRestore,
      });
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to switch to QR login');
    } finally {
      setSubmitting(false);
    }
  }, [accountId, platform, reset, sessionId, skipDiskRestore]);

  const startPhoneLogin = useCallback(
    async (phone: string) => {
      const api = window.electronAPI?.platformLogin;
      if (!api || !platform) return;

      setSubmitting(true);
      setError(null);
      try {
        sessionReadyRef.current = false;
        await api.cancel(sessionId);
        setView('phone');
        setStatus('loading');
        setQrDataUrl(null);
        setPairingCode(null);
        loginStartedRef.current = true;
        await api.start({ sessionId, platform, mode: 'phone', phone });
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Phone login failed');
      } finally {
        setSubmitting(false);
      }
    },
    [platform, sessionId],
  );

  const submitCode = useCallback(
    async (code: string) => {
      const api = window.electronAPI?.platformLogin;
      if (!api || !platform) return;

      setSubmitting(true);
      setError(null);
      try {
        await api.submit({ sessionId, platform, kind: 'code', value: code });
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Invalid login code');
      } finally {
        setSubmitting(false);
      }
    },
    [platform, sessionId],
  );

  const submit2fa = useCallback(
    async (password: string) => {
      const api = window.electronAPI?.platformLogin;
      if (!api || !platform) return;

      setSubmitting(true);
      setError(null);
      try {
        await api.submit({ sessionId, platform, kind: '2fa', value: password });
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Invalid 2FA password');
      } finally {
        setSubmitting(false);
      }
    },
    [platform, sessionId],
  );

  return {
    view,
    status,
    qrDataUrl,
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
