import type { Platform } from '@/types/database';

/** E.164-ish digits only — for WhatsApp pairing & Telegram phone login */
export function normalizeLoginPhone(raw: string, platform: Platform): string {
  const value = raw.trim();
  if (!value) {
    throw new Error('Phone number is required');
  }

  if (platform === 'telegram' && value.startsWith('@')) {
    throw new Error('Phone login requires a phone number, not @username');
  }

  const digits = value.replace(/\D/g, '');
  if (digits.length < 8) {
    throw new Error('Invalid phone number');
  }

  return digits;
}

export function formatPairingCode(code: string): string {
  const clean = code.replace(/\s/g, '').toUpperCase();
  return clean.match(/.{1,4}/g)?.join('-') ?? clean;
}
