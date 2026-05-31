import type { Platform } from '@/types/database';

/** Selaras rm_invite_link_is_valid di Supabase. */
export function isInviteLinkValid(platform: Platform, inviteLink: string | null | undefined): boolean {
  const link = String(inviteLink ?? '').trim();
  if (!link || link === '-') return false;
  if (link.toLowerCase().includes('undefined')) return false;

  if (platform === 'whatsapp') {
    return /^https?:\/\/(www\.)?chat\.whatsapp\.com\/[a-zA-Z0-9_-]+$/i.test(link);
  }

  if (platform === 'telegram') {
    return /^https?:\/\/(t\.me|telegram\.me)\/[a-zA-Z0-9_+/=-]+$/i.test(link);
  }

  return false;
}
