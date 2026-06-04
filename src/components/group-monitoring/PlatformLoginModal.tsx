import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { BrandImage } from '@/components/brand/BrandImage';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { usePlatformLogin } from '@/hooks/usePlatformLogin';
import {
  accountPlatformSubtitle,
  login2faPasswordPlaceholder,
  loginCodeHint,
  loginEnterCodeLabel,
  loginPhoneTitle,
} from '@/lib/platformSyncCopy';
import { formatPairingCode, normalizeLoginPhone } from '@/lib/phoneLogin';
import type { Platform } from '@/types/database';

interface PlatformLoginModalProps {
  open: boolean;
  platform: Platform | null;
  accountName: string;
  sessionId: string;
  /** UUID akun di Supabase — wajib untuk restore session dari `platform_sessions`. */
  dbAccountId?: string;
  phoneNumber?: string;
  loginHint?: string;
  attemptRestore?: boolean;
  onClose: () => void;
  onLoginSuccess?: () => void;
}

export function PlatformLoginModal({
  open,
  platform,
  accountName,
  sessionId,
  dbAccountId,
  phoneNumber = '',
  loginHint = '',
  attemptRestore = true,
  onClose,
  onLoginSuccess,
}: PlatformLoginModalProps) {
  const { t } = useLanguage();
  const isTelegram = platform === 'telegram';
  const {
    view,
    status,
    qrDataUrl,
    qrGeneration,
    pairingCode,
    error,
    submitting,
    refreshQrManual,
    switchToPhoneForm,
    startPhoneLogin,
    submitCode,
    submit2fa,
  } = usePlatformLogin(open, platform, sessionId, phoneNumber, {
    accountId: dbAccountId ?? sessionId,
    attemptRestore,
    t,
  });

  const [phone, setPhone] = useState(phoneNumber);
  const [code, setCode] = useState('');
  const [twoFa, setTwoFa] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const loginHandledRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setPersisting(false);
      setPersistError(null);
      return;
    }
    loginHandledRef.current = false;
    setPhone(phoneNumber);
    setCode('');
    setTwoFa('');
    setPhoneError(null);
  }, [open, phoneNumber, sessionId, platform]);

  useEffect(() => {
    if (!open || status !== 'ready' || loginHandledRef.current) return;
    loginHandledRef.current = true;
    setPersisting(true);
    void Promise.resolve(onLoginSuccess?.())
      .catch((err: unknown) => {
        setPersistError(
          err instanceof Error
            ? err.message
            : 'Failed to save session. Link Telegram again on this device.',
        );
      })
      .finally(() => setPersisting(false));
  }, [onLoginSuccess, open, status]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  if (!open || !platform) return null;

  const showQrPanel =
    (view === 'qr' || (view === 'phone' && Boolean(pairingCode))) &&
    status !== 'ready' &&
    status !== '2fa' &&
    status !== 'code';

  const qrLoading =
    !pairingCode &&
    !qrDataUrl &&
    status !== 'error' &&
    (status === 'loading' ||
      status === 'restoring' ||
      status === 'starting-qr' ||
      status === 'qr' ||
      status === 'confirming');

  const qrFailed =
    !pairingCode && status === 'error' && (view === 'qr' || view === 'phone');
  const showSavingPanel = status === 'ready' || persisting;
  const showPhoneForm = view === 'phone' && !pairingCode && !showSavingPanel;
  const showCodeForm = view === 'code' && !showSavingPanel;
  const show2faForm = view === '2fa' && !showSavingPanel;
  const isFormLayout = showPhoneForm || showCodeForm || show2faForm || showSavingPanel;

  function handlePhoneSubmit(event: FormEvent) {
    event.preventDefault();
    if (!platform) return;

    setPhoneError(null);
    try {
      const normalized = normalizeLoginPhone(phone, platform);
      void startPhoneLogin(normalized);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Invalid phone number');
    }
  }

  function handleCodeSubmit(event: FormEvent) {
    event.preventDefault();
    void submitCode(code.trim());
  }

  function handle2faSubmit(event: FormEvent) {
    event.preventDefault();
    void submit2fa(twoFa);
  }

  const statusLabel =
    persisting
      ? t('groupMonitoring.sync.loginSaving')
      : status === 'ready'
      ? t('groupMonitoring.sync.loginReady')
      : status === 'confirming'
        ? isTelegram
          ? t('groupMonitoring.sync.loginConfirming')
          : t('groupMonitoring.sync.loginConfirmingLoading')
      : status === 'error'
        ? error ?? t('groupMonitoring.sync.loginFailed')
        : status === 'unsupported'
          ? error ?? t('groupMonitoring.sync.desktopRequired')
          : showCodeForm
            ? error ?? loginEnterCodeLabel(platform, t)
            : show2faForm
              ? error ?? t('groupMonitoring.sync.enter2faPassword')
              : pairingCode
                ? t('groupMonitoring.sync.enterPairingCode')
                : status === 'qr'
                  ? t('groupMonitoring.sync.scanQr')
                  : status === 'restoring'
                    ? t('groupMonitoring.sync.restoringSession')
                    : status === 'starting-qr'
                      ? isTelegram
                        ? t('groupMonitoring.sync.generatingQr')
                        : t('groupMonitoring.sync.startingWhatsApp')
                      : isTelegram
                        ? t('groupMonitoring.sync.generatingQr')
                        : qrDataUrl
                          ? t('groupMonitoring.sync.scanQr')
                          : t('groupMonitoring.sync.loadingQr');

  return (
    <BrandModalRoot onBackdropClick={onClose}>
      <div
        className={cn(
          'brand-modal-panel platform-login-panel',
          !isTelegram && 'platform-login-panel--wa',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-login-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="platform-login-header">
          <div className="platform-login-heading">
            <BrandImage
              asset={isTelegram ? 'telegram' : 'whatsapp'}
              alt={platform}
              className="h-5 w-5 shrink-0"
            />
            <div className="min-w-0">
              <h2 id="platform-login-title" className="platform-login-title">
                {showPhoneForm || showCodeForm || show2faForm
                  ? loginPhoneTitle(platform, t)
                  : isTelegram
                    ? t('groupMonitoring.sync.telegramLoginTitle')
                    : t('groupMonitoring.sync.whatsappLoginTitle')}
              </h2>
              <p className="platform-login-subtitle">
                {accountPlatformSubtitle(accountName, platform)}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="brand-modal-close"
            onClick={onClose}
            disabled={submitting || persisting}
            aria-label={t('groupMonitoring.accountCard.closeModal')}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className={cn('platform-login-body', isFormLayout && 'platform-login-body--form')}>
          {loginHint && showQrPanel ? (
            <p className="platform-login-force-hint" role="status">
              {loginHint}
            </p>
          ) : null}
          {showSavingPanel ? (
            <div className="platform-login-form platform-login-form--saving">
              <Loader2 className="platform-login-qr-spinner" strokeWidth={2} aria-hidden />
              <p className="platform-login-hint">{statusLabel}</p>
              {persistError ? (
                <p className="platform-login-field-error" role="alert">
                  {persistError}
                </p>
              ) : null}
            </div>
          ) : null}

          {showPhoneForm ? (
            <form className="platform-login-form" onSubmit={handlePhoneSubmit}>
              <label className="platform-login-label" htmlFor="login-phone">
                {t('groupMonitoring.sync.phoneLabel')}
              </label>
              <input
                id="login-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={t('groupMonitoring.sync.loginPhonePlaceholder')}
                className="platform-login-input"
                autoFocus
              />
              {(phoneError || error) && status !== 'loading' ? (
                <p className="platform-login-field-error" role="alert">
                  {phoneError ?? error}
                </p>
              ) : null}
              <button type="submit" className="platform-login-submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('groupMonitoring.sync.continuePhone')}
              </button>
              <button
                type="button"
                className="platform-login-alt-link"
                disabled={submitting}
                onClick={() => void refreshQrManual()}
              >
                {t('groupMonitoring.sync.switchToQr')}
              </button>
            </form>
          ) : null}

          {showCodeForm ? (
            <form className="platform-login-form" onSubmit={handleCodeSubmit}>
              <p className="platform-login-hint">{loginCodeHint(platform, t)}</p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={t('groupMonitoring.sync.codePlaceholder')}
                className="platform-login-input platform-login-input--code"
                autoFocus
              />
              {error ? (
                <p className="platform-login-field-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="platform-login-submit"
                disabled={submitting || code.trim().length < 4}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('groupMonitoring.sync.verifyCode')}
              </button>
            </form>
          ) : null}

          {show2faForm ? (
            <form className="platform-login-form" onSubmit={handle2faSubmit}>
              <p className="platform-login-hint">{t('groupMonitoring.sync.twoFaHint')}</p>
              <input
                type="password"
                autoComplete="current-password"
                value={twoFa}
                onChange={(event) => setTwoFa(event.target.value)}
                placeholder={login2faPasswordPlaceholder(platform, t)}
                className="platform-login-input"
                autoFocus
              />
              {error ? (
                <p className="platform-login-field-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="platform-login-submit"
                disabled={submitting || !twoFa.trim()}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('groupMonitoring.sync.verify2fa')}
              </button>
            </form>
          ) : null}

          {showQrPanel ? (
            <div className="platform-login-qr-row">
              <ol className="platform-login-steps">
                {(isTelegram
                  ? pairingCode
                    ? [
                        t('groupMonitoring.sync.telegramPhoneStep1'),
                        t('groupMonitoring.sync.telegramPhoneStep2'),
                      ]
                    : [
                        t('groupMonitoring.sync.telegramStep1'),
                        t('groupMonitoring.sync.telegramStep2'),
                        t('groupMonitoring.sync.telegramStep3'),
                        t('groupMonitoring.sync.telegramStep4'),
                      ]
                  : pairingCode
                    ? [
                        t('groupMonitoring.sync.whatsappPhoneStep1'),
                        t('groupMonitoring.sync.whatsappPhoneStep2'),
                        t('groupMonitoring.sync.whatsappPhoneStep3'),
                      ]
                    : [
                        t('groupMonitoring.sync.whatsappStep1'),
                        t('groupMonitoring.sync.whatsappStep2'),
                        t('groupMonitoring.sync.whatsappStep3'),
                        t('groupMonitoring.sync.whatsappStep4'),
                      ]
                ).map((step, index) => (
                  <li key={step}>
                    <span className="platform-login-step-num">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <div className="platform-login-qr-box">
                {qrFailed ? (
                  <div className="platform-login-qr-overlay" role="alert">
                    <p className="platform-login-qr-overlay-title">
                      {error?.toLowerCase().includes('timeout') ||
                      error?.toLowerCase().includes('expired')
                        ? t('groupMonitoring.sync.qrExpiredTitle')
                        : t('groupMonitoring.sync.qrLoadFailedTitle')}
                    </p>
                    <p className="platform-login-qr-overlay-msg">
                      {error ?? t('groupMonitoring.sync.loginFailed')}
                    </p>
                    <button
                      type="button"
                      className="platform-login-qr-refresh-btn"
                      disabled={submitting}
                      onClick={() => void refreshQrManual()}
                    >
                      {t('groupMonitoring.sync.refreshQr')}
                    </button>
                  </div>
                ) : null}

                {pairingCode ? (
                  <p className="platform-login-pairing-code">{formatPairingCode(pairingCode)}</p>
                ) : qrLoading ? (
                  <div className="platform-login-qr-skeleton" aria-busy="true">
                    <Loader2 className="platform-login-qr-spinner" strokeWidth={2} aria-hidden />
                    <p className="platform-login-qr-skeleton-label">{statusLabel}</p>
                  </div>
                ) : qrDataUrl && status !== 'confirming' ? (
                  <img
                    key={`qr-${qrGeneration}`}
                    src={qrDataUrl}
                    alt="Login QR code"
                    className="platform-login-qr-img"
                  />
                ) : status !== 'error' ? (
                  <Loader2 className="platform-login-qr-spinner" strokeWidth={2} aria-hidden />
                ) : null}

                {persistError ? (
                  <p className="platform-login-qr-error" role="alert">
                    {persistError}
                  </p>
                ) : null}
                {!qrFailed ? (
                  <p className="platform-login-qr-status">
                    {statusLabel}
                    {qrGeneration > 1
                      ? ` · ${t('groupMonitoring.sync.qrUpdated')}`
                      : ''}
                  </p>
                ) : null}
                {!isTelegram && pairingCode ? (
                  <p className="platform-login-hint platform-login-hint--inline">
                    {t('groupMonitoring.sync.wa2faHint')}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {view === 'qr' ? (
          <footer className="platform-login-footer">
            <button
              type="button"
              className="platform-login-alt-link"
              disabled={submitting}
              onClick={() => void switchToPhoneForm()}
            >
              {isTelegram
                ? t('groupMonitoring.sync.telegramPhoneLogin')
                : t('groupMonitoring.sync.whatsappPhoneLogin')}
            </button>
          </footer>
        ) : null}
      </div>
    </BrandModalRoot>
  );
}
