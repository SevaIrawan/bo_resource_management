type ScrapePlatform = 'whatsapp' | 'telegram';

export function assertScrapeHasGroups(
  platform: ScrapePlatform,
  groups: unknown[],
  raw: { hint?: string; telegramUser?: string; deviceGroupCount?: number },
): void {
  if (groups.length > 0) return;

  const hint = typeof raw.hint === 'string' ? raw.hint : undefined;
  const tgUser = typeof raw.telegramUser === 'string' ? raw.telegramUser : undefined;
  const deviceCount =
    typeof raw.deviceGroupCount === 'number' && Number.isFinite(raw.deviceGroupCount)
      ? Math.floor(raw.deviceGroupCount)
      : 0;

  if (platform === 'telegram' && hint?.includes('ZERO_GROUPS_ON_ACCOUNT')) {
    throw new Error(
      `SCRAPER_NO_GROUPS: Telegram @${tgUser ?? 'unknown'} — no groups on this account. Log in again if wrong account.`,
    );
  }
  if (platform === 'whatsapp' && deviceCount > 0) {
    throw new Error(
      `SCRAPER_INCOMPLETE: store listed ${deviceCount} groups but scrape returned 0 rows. Wait for WhatsApp Web sync, then Scrape Now again.`,
    );
  }
  throw new Error('SCRAPER_NO_GROUPS');
}
