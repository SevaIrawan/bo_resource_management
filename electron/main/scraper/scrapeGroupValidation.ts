type ScrapePlatform = 'whatsapp' | 'telegram';

export function assertScrapeHasGroups(
  platform: ScrapePlatform,
  groups: unknown[],
  raw: { hint?: string; telegramUser?: string },
): void {
  if (groups.length > 0) return;

  const hint = typeof raw.hint === 'string' ? raw.hint : undefined;
  const tgUser = typeof raw.telegramUser === 'string' ? raw.telegramUser : undefined;

  if (platform === 'telegram' && hint === 'ZERO_GROUPS_ON_ACCOUNT') {
    throw new Error(
      `SCRAPER_NO_GROUPS: Telegram @${tgUser ?? 'unknown'} — tidak ada grup di akun ini. Login ulang jika salah akun.`,
    );
  }
  if (platform === 'whatsapp') {
    throw new Error(
      'SCRAPER_NO_GROUPS: WhatsApp tidak mengembalikan grup. Pastikan sudah CONNECTED dan coba lagi.',
    );
  }
  throw new Error('SCRAPER_NO_GROUPS');
}
