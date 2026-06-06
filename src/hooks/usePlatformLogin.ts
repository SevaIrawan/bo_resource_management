import { useCallback, useEffect, useRef, useState } from 'react';
import { loginQrTimeoutMessage } from '@/lib/platformSyncCopy';
import { resolveDeviceSessionId } from '@/lib/deviceSessionId';
import { tryWarmPlatformSession } from '@/lib/warmPlatformSession';
import { isWhatsAppBrowserBusyMessage } from '@/lib/waLoginErrors';
import { isRetryableNetworkError, NETWORK_RETRY_ATTEMPTS } from '@/lib/networkRetry';
import { withTimeout } from '@/lib/withTimeout';
import {
  accountGroupEstimate,
  waLoginConfirmingTimeoutMs,
  waQrBootstrapDeadlineMs,
  waQrScanWaitMs,
} from '@/config/syncScraperPolicy';
import type { Platform } from '@/types/database';

const TG_LOGIN_RESTORE_TIMEOUT_MS = 15_000;
const TG_QR_TIMEOUT_MS = 180_000;
const WA_PREPARE_SETTLE_MS = 3_500;
const TG_CONFIRMING_TIMEOUT_MS = 180_000;
const WA_QR_MAX_RETRIES = NETWORK_RETRY_ATTEMPTS;

type PlatformLoginApi = NonNullable<NonNullable<Window['electronAPI']>['platformLogin']>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

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
    /** Tutup modal — login Chrome tetap jalan sampai sukses / cancel eksplisit. */
    persistSession?: boolean;
    groupsCurrent?: number | null;
    groupsTotal?: number | null;
    t?: (key: string, vars?: Record<string, string | number>) => string;
  },
) {
  const dbAccountId = options?.accountId ?? sessionId;
  const attemptRestore = options?.attemptRestore !== false;
  const skipDiskRestore = options?.attemptRestore === false;
  const persistSession = options?.persistSession === true;
  const groupEstimate = accountGroupEstimate({
    groupsCurrent: options?.groupsCurrent,
    groupsTotal: options?.groupsTotal,
  });
  const waQrAppearMs = waQrBootstrapDeadlineMs(groupEstimate);
  const waQrScanMs = waQrScanWaitMs(groupEstimate);
  const waConfirmingMs = waLoginConfirmingTimeoutMs(groupEstimate);
  const t = options?.t ?? ((key: string) => key);

  const [view, setView] = useState<LoginView>('qr');
  const [status, setStatus] = useState<LoginStatus>('loading');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrGeneration, setQrGeneration] = useState(0);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [chromeSessionActive, setChromeSessionActive] = useState(false);

  const sessionReadyRef = useRef(false);
  const loginStartedRef = useRef(false);
  const electronSessionIdRef = useRef(sessionId);
  const qrTimeoutIdRef = useRef<number | undefined>(undefined);
  const loginRunIdRef = useRef(0);
  const acceptQrRef = useRef(false);
  const lastQrGenerationRef = useRef(0);
  const prevOpenRef = useRef(false);
  const loginSucceededRef = useRef(false);
  const loginStatusRef = useRef<LoginStatus>('loading');
  const qrAppearDeadlineRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    loginStatusRef.current = status;
  }, [status]);

  const clearQrTimeout = useCallback(() => {
    if (qrTimeoutIdRef.current !== undefined) {
      window.clearTimeout(qrTimeoutIdRef.current);
      qrTimeoutIdRef.current = undefined;
    }
  }, []);

  const clearQrAppearDeadline = useCallback(() => {
    if (qrAppearDeadlineRef.current !== undefined) {
      window.clearTimeout(qrAppearDeadlineRef.current);
      qrAppearDeadlineRef.current = undefined;
    }
  }, []);

  const armQrAppearDeadline = useCallback(
    (plat: Platform) => {
      clearQrAppearDeadline();
      if (plat !== 'whatsapp') return;

      qrAppearDeadlineRef.current = window.setTimeout(() => {
        qrAppearDeadlineRef.current = undefined;
        if (lastQrGenerationRef.current > 0 || sessionReadyRef.current) return;

        clearQrTimeout();
        setStatus('error');
        setError(
          t('groupMonitoring.sync.qrAppearTimeout') ??
            'QR is still loading. Please wait, or close and tap Sync again.',
        );
      }, waQrAppearMs);
    },
    [clearQrAppearDeadline, clearQrTimeout, t, waQrAppearMs],
  );

  const armQrTimeout = useCallback(
    (plat: Platform) => {
      clearQrTimeout();
      const ms =
        plat === 'whatsapp' ? waQrScanMs : TG_QR_TIMEOUT_MS;
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
    [clearQrTimeout, t, waQrScanMs],
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

      setChromeSessionActive(true);

      const gen =
        typeof payload.generation === 'number' && payload.generation > 0
          ? payload.generation
          : lastQrGenerationRef.current + 1;
      if (gen <= lastQrGenerationRef.current) return;
      lastQrGenerationRef.current = gen;

      clearQrAppearDeadline();
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
      setChromeSessionActive(true);
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
      if (payload.phase === 'loading' && platform === 'whatsapp') {
        setChromeSessionActive(true);
        clearQrAppearDeadline();
        setView('qr');
        setStatus('starting-qr');
        setError(null);
      }
    });

    const offReady = api.onReady((payload) => {
      if (!matchesSession(payload)) return;
      clearQrTimeout();
      sessionReadyRef.current = true;
      loginSucceededRef.current = true;
      setChromeSessionActive(false);
      setView('qr');
      setStatus('ready');
      setError(null);
    });

    const offError = api.onError((payload) => {
      if (!matchesSession(payload)) return;
      if (sessionReadyRef.current || loginSucceededRef.current) return;

      const message = payload.message ?? '';
      if (platform === 'telegram') {
        // TG: abaikan noise sementara saat QR; kegagalan tetap → error (tanpa auto-loop QR / restart login).
        const transient =
          /internal server error|session not found|sidecar|invalid json|empty response/i.test(
            message,
          );
        const duringQr =
          loginStatusRef.current === 'qr' ||
          loginStatusRef.current === 'confirming' ||
          loginStatusRef.current === 'starting-qr' ||
          loginStatusRef.current === 'loading';
        if (transient && duringQr) return;
      }

      clearQrAppearDeadline();
      clearQrTimeout();
      setQrDataUrl(null);
      setStatus('error');
      setError(message || 'Login failed');
    });

    return () => {
      offQr();
      offPairing();
      offPhase();
      offReady();
      offError();
    };
  }, [armQrTimeout, clearQrAppearDeadline, clearQrTimeout, dbAccountId, platform, sessionId]);

  // Setelah scan: fase confirming sampai event `ready` — jangan timeout terlalu cepat (akun besar).
  useEffect(() => {
    if ((!open && !persistSession) || status !== 'confirming' || !platform) return;
    const ms = platform === 'whatsapp' ? waConfirmingMs : TG_CONFIRMING_TIMEOUT_MS;
    const timeoutId = window.setTimeout(() => {
      if (sessionReadyRef.current || loginSucceededRef.current) return;
      setStatus('error');
      setError(
        t('groupMonitoring.sync.loginConfirmingTimeout', {
          platform: platform === 'whatsapp' ? 'WhatsApp' : 'Telegram',
        }) ??
          'Account is still loading after scan. For large group lists this can take several minutes — wait, or close and tap Sync again.',
      );
    }, ms);
    return () => window.clearTimeout(timeoutId);
  }, [open, persistSession, platform, status, t, waConfirmingMs]);

  // Buka modal baru → reset state (hindari status `ready` lama memicu persist ulang)
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open || persistSession;

    if (!justOpened || !platform || !sessionId) return;

    loginSucceededRef.current = false;
    sessionReadyRef.current = false;
    loginStartedRef.current = false;
    setChromeSessionActive(false);
    setView('qr');
    setStatus('loading');
    setQrDataUrl(null);
    setQrGeneration(0);
    setPairingCode(null);
    setError(null);
    setSubmitting(false);
  }, [open, persistSession, platform, sessionId]);

  // Tutup modal: background (persistSession) biarkan Chrome; selain itu cancel.
  useEffect(() => {
    if (open) return;

    clearQrTimeout();
    clearQrAppearDeadline();

    if (persistSession) return;

    const api = window.electronAPI?.platformLogin;
    const hadSucceeded = loginSucceededRef.current;
    if (api && loginStartedRef.current && !hadSucceeded) {
      void api.cancel(electronSessionIdRef.current, platform ?? undefined);
    }
    if (!hadSucceeded) {
      loginStartedRef.current = false;
      sessionReadyRef.current = false;
      setChromeSessionActive(false);
    }
  }, [clearQrAppearDeadline, clearQrTimeout, open, persistSession, platform]);

  const markChromeSessionActive = useCallback(() => {
    setChromeSessionActive(true);
  }, []);

  const prepareWhatsAppForQr = useCallback(
    async (deviceSessionId: string, purgeDisk: boolean) => {
      const api = window.electronAPI?.platformLogin;
      if (!api) return;

      await api.cancel(deviceSessionId, 'whatsapp').catch(() => undefined);
      await api.release(deviceSessionId, { purgeWaDisk: purgeDisk }).catch(() => undefined);
      await sleep(WA_PREPARE_SETTLE_MS);
    },
    [],
  );

  const startWhatsAppQr = useCallback(
    async (
      deviceSessionId: string,
      api: PlatformLoginApi,
      purgeDisk: boolean,
      retryCount: number,
    ): Promise<void> => {
      try {
        await api.start({
          sessionId: deviceSessionId,
          platform: 'whatsapp',
          mode: 'qr',
          skipDiskRestore: purgeDisk,
          groupEstimate,
        });
        markChromeSessionActive();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const canRetry =
          retryCount < WA_QR_MAX_RETRIES - 1 &&
          (isWhatsAppBrowserBusyMessage(message) || isRetryableNetworkError(error));
        if (canRetry) {
          await prepareWhatsAppForQr(deviceSessionId, purgeDisk);
          return startWhatsAppQr(deviceSessionId, api, purgeDisk, retryCount + 1);
        }
        throw error;
      }
    },
    [groupEstimate, markChromeSessionActive, prepareWhatsAppForQr],
  );

  // Start login (tanpa cancel saat StrictMode remount)
  useEffect(() => {
    if ((!open && !persistSession) || !platform || !sessionId) return;

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
      const isStale = () =>
        loginRunIdRef.current !== runId || (!open && !persistSession);

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
        armQrAppearDeadline(platform);

        if (platform === 'whatsapp') {
          void startWhatsAppQr(deviceSessionId, api, skipDiskRestore, 0).catch((err: unknown) => {
            if (isStale()) return;
            clearQrAppearDeadline();
            clearQrTimeout();
            setStatus('error');
            setError(err instanceof Error ? err.message : 'Failed to start login');
          });
          return;
        }

        void api
          .start({
            sessionId: deviceSessionId,
            platform,
            mode: 'qr',
            skipDiskRestore,
          })
          .then(() => markChromeSessionActive())
          .catch((err: unknown) => {
            if (isStale()) return;
            clearQrAppearDeadline();
            clearQrTimeout();
            setStatus('error');
            setError(err instanceof Error ? err.message : 'Failed to start login');
          });
      };

      if (platform === 'whatsapp') {
        const api = window.electronAPI?.platformLogin;
        await api?.cancel(deviceSessionId, 'whatsapp').catch(() => undefined);
        if (!skipDiskRestore) {
          await prepareWhatsAppForQr(deviceSessionId, false);
        } else {
          await sleep(400);
        }
        if (isStale()) return;

        if (!skipDiskRestore && attemptRestore) {
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
              clearQrAppearDeadline();
              setStatus('ready');
              return;
            }
          } catch {
            if (isStale()) return;
          }
          acceptQrRef.current = true;
          await prepareWhatsAppForQr(deviceSessionId, false);
          if (isStale()) return;
        }

        setStatus('starting-qr');
        startQrLogin();
        return;
      }

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
      clearQrAppearDeadline();
    };
  }, [
    armQrAppearDeadline,
    armQrTimeout,
    attemptRestore,
    clearQrAppearDeadline,
    clearQrTimeout,
    dbAccountId,
    groupEstimate,
    open,
    persistSession,
    platform,
    prepareWhatsAppForQr,
    markChromeSessionActive,
    sessionId,
    skipDiskRestore,
    startWhatsAppQr,
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
        await prepareWhatsAppForQr(deviceSessionId, true);
      }
      setStatus('starting-qr');
      armQrTimeout(platform);
      armQrAppearDeadline(platform);
      loginStartedRef.current = true;
      markChromeSessionActive();
      if (platform === 'whatsapp') {
        void startWhatsAppQr(deviceSessionId, api, true, 0);
      } else {
        void api
          .start({
            sessionId: deviceSessionId,
            platform,
            mode: 'qr',
            skipDiskRestore: false,
          })
          .then(() => markChromeSessionActive());
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to switch to QR login');
    } finally {
      setSubmitting(false);
    }
  }, [armQrAppearDeadline, armQrTimeout, dbAccountId, markChromeSessionActive, platform, prepareWhatsAppForQr, sessionId, startWhatsAppQr]);

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
        markChromeSessionActive();
        await api.start({ sessionId: deviceSessionId, platform, mode: 'phone', phone });
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Phone login failed');
      } finally {
        setSubmitting(false);
      }
    },
    [dbAccountId, markChromeSessionActive, platform, sessionId],
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

  const refreshQrManual = switchToQr;

  return {
    view,
    status,
    qrDataUrl,
    qrGeneration,
    pairingCode,
    error,
    submitting,
    chromeSessionActive,
    defaultPhone,
    switchToQr,
    refreshQrManual,
    switchToPhoneForm,
    startPhoneLogin,
    submitCode,
    submit2fa,
  };
}
