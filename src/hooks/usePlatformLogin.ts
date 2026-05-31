import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { loginQrTimeoutMessage } from '@/lib/platformSyncCopy';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { tryWarmPlatformSession } from '@/lib/warmPlatformSession';
import { withTimeout } from '@/lib/withTimeout';
import type { Platform } from '@/types/database';

const LOGIN_RESTORE_TIMEOUT_MS = 12_000;

export type LoginView = 'qr' | 'phone' | 'code' | '2fa';
export type LoginStatus =
  | 'loading'
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
  options?: { accountId?: string; attemptRestore?: boolean },
) {
  const accountId = options?.accountId ?? sessionId;
  const attemptRestore = options?.attemptRestore !== false;
  const skipDiskRestore = options?.attemptRestore === false;
  const [view, setView] = useState<LoginView>('qr');
  const [status, setStatus] = useState<LoginStatus>('loading');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const sessionReadyRef = useRef(false);
  const loginStartedRef = useRef(false);
  const electronSessionIdRef = useRef(sessionId);
  const { t, locale } = useLanguage();

  electronSessionIdRef.current = sessionId;

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
        setView('qr');
        setStatus('confirming');
        setError(null);
      }
    });

    const offReady = api.onReady((payload) => {
      if (!matchesSession(payload)) return;
      sessionReadyRef.current = true;
      setStatus('ready');
      setError(null);
    });

    const offError = api.onError((payload) => {
      if (!matchesSession(payload)) return;
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
  }, [open, platform, sessionId]);

  // Start / cancel login — cancel hanya saat modal ditutup
  useEffect(() => {
    if (!open || !platform || !sessionId) {
      if (!open && loginStartedRef.current && !sessionReadyRef.current) {
        const api = window.electronAPI?.platformLogin;
        if (api) {
          void api.cancel(electronSessionIdRef.current);
          if (electronSessionIdRef.current !== sessionId) {
            void api.cancel(sessionId);
          }
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

    reset();
    loginStartedRef.current = true;
    sessionReadyRef.current = false;

    void (async () => {
      setStatus('loading');
      setError(null);
      const deviceSessionId = await resolveDeviceSessionId({
        sessionId,
        platform,
        accountId,
      });
      electronSessionIdRef.current = deviceSessionId;

      if (attemptRestore) {
        try {
          const warmed = await withTimeout(
            tryWarmPlatformSession({
              sessionId,
              platform,
              accountId,
            }),
            LOGIN_RESTORE_TIMEOUT_MS,
            'Restore session',
          );
          if (warmed) {
            sessionReadyRef.current = true;
            setStatus('ready');
            return;
          }
        } catch {
          // lanjut ke QR
        }
      }

      await api.start({
        sessionId: deviceSessionId,
        platform,
        mode: 'qr',
        skipDiskRestore,
      });
    })().catch((err: unknown) => {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to start login');
    });

    const qrTimeout = window.setTimeout(() => {
      setStatus((current) => {
        if (current === 'loading') {
          setError(loginQrTimeoutMessage(platform, t));
          return 'error';
        }
        return current;
      });
    }, 45000);

    return () => {
      window.clearTimeout(qrTimeout);
    };
  }, [accountId, attemptRestore, open, platform, sessionId, reset, skipDiskRestore, locale, t]);

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
      await api.start({
        sessionId: deviceSessionId,
        platform,
        mode: 'qr',
        // Ganti ke QR = auth disk lama harus dibuang supaya event `qr` keluar.
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
