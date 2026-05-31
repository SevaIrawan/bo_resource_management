import type { Platform } from '@/types/database';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

const SYNC = 'groupMonitoring.sync';

export function platformDisplayName(platform: Platform): string {
  return platform === 'whatsapp' ? 'WhatsApp' : 'Telegram';
}

export function syncSessionValidMessage(platform: Platform, t: TFn): string {
  return platform === 'whatsapp'
    ? t(`${SYNC}.sessionValidMessageWa`)
    : t(`${SYNC}.sessionValidMessageTg`);
}

/** Payload dari useAccountSyncFlow: DEVICE:y|BRAND:x|MASTER:m|ADMIN:a */
export function parseSyncMetricsPayload(code: string | null | undefined): {
  device: number;
  brand: number;
  master: number;
  admin: number;
} | null {
  if (!code?.startsWith('DEVICE:')) return null;
  const parts = Object.fromEntries(
    code.split('|').map((seg) => {
      const [k, v] = seg.split(':');
      return [k, Number(v)];
    }),
  );
  if (Number.isNaN(parts.DEVICE) || Number.isNaN(parts.BRAND)) return null;
  return {
    device: parts.DEVICE,
    brand: parts.BRAND,
    master: parts.MASTER ?? 0,
    admin: parts.ADMIN ?? 0,
  };
}

export function syncSessionValidDetailMessage(
  platform: Platform,
  metrics: { device: number; brand: number; master: number; admin: number },
  t: TFn,
): string {
  const aligned = metrics.brand > 0 && metrics.device === metrics.brand;
  return t(`${SYNC}.sessionValidDetail`, {
    platform: platformDisplayName(platform),
    device: metrics.device,
    brand: metrics.brand,
    master: metrics.master,
    admin: metrics.admin,
    aligned: aligned ? 'yes' : 'no',
  });
}

export function loginQrTimeoutMessage(platform: Platform, t: TFn): string {
  return platform === 'whatsapp'
    ? t(`${SYNC}.qrTimeoutWa`)
    : t(`${SYNC}.qrTimeoutTg`);
}

export function loginPhoneTitle(platform: Platform, t: TFn): string {
  return platform === 'whatsapp'
    ? t(`${SYNC}.phoneLoginTitleWa`)
    : t(`${SYNC}.phoneLoginTitleTg`);
}

export function loginEnterCodeLabel(_platform: Platform, t: TFn): string {
  return t(`${SYNC}.enterLoginCodeTg`);
}

export function loginCodeHint(platform: Platform, t: TFn): string {
  return platform === 'whatsapp'
    ? t(`${SYNC}.whatsappPairingHint`)
    : t(`${SYNC}.telegramCodeHint`);
}

export function login2faPasswordPlaceholder(_platform: Platform, t: TFn): string {
  return t(`${SYNC}.passwordPlaceholderTg`);
}

export function scrapeProgressTitle(platform: Platform, t: TFn): string {
  return platform === 'whatsapp'
    ? t(`${SYNC}.scrapingTitleWa`)
    : t(`${SYNC}.scrapingTitleTg`);
}

export function scrapeProgressMessage(platform: Platform, t: TFn): string {
  return platform === 'whatsapp'
    ? t(`${SYNC}.scrapingMessageWa`)
    : t(`${SYNC}.scrapingMessageTg`);
}

export function postLoginScrapeMessage(
  platform: Platform,
  account: string,
  t: TFn,
): string {
  return t(`${SYNC}.postLoginScrapeMessage`, {
    account,
    platform: platformDisplayName(platform),
  });
}

/** Sematkan nama platform pada subtitle akun di modal. */
export function accountPlatformSubtitle(
  accountName: string,
  platform: Platform,
): string {
  return `${accountName} · ${platformDisplayName(platform)}`;
}

export type SyncFlowMessageCode =
  | 'SESSION_INVALID_RELOGIN'
  | 'SESSION_INVALID_FORCE_SCRAPER';

export function resolveSyncFlowMessage(
  code: string | null | undefined,
  platform: Platform | null,
  t: TFn,
): string {
  if (!code || !platform) return '';

  if (code === 'SESSION_INVALID_FORCE_SCRAPER') {
    return platform === 'whatsapp'
      ? t('groupMonitoring.sync.forceLoginHintWa')
      : t('groupMonitoring.sync.forceLoginHintTg');
  }

  if (code === 'SESSION_INVALID_RELOGIN') {
    return platform === 'whatsapp'
      ? t('groupMonitoring.sync.reloginHintWa')
      : t('groupMonitoring.sync.reloginHintTg');
  }

  return code;
}

export function accountNeedsRelogin(account: {
  status: string;
  sessionStatus: string;
}): boolean {
  return account.sessionStatus === 'invalid' || account.status === 'logout';
}
