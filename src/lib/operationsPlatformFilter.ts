import type { Platform } from '@/types/database';

/** Operations tab — platform wajib WA atau TG (tanpa "all"). */
export function resolveOperationsPlatform(platform: string): Platform {
  return platform === 'telegram' ? 'telegram' : 'whatsapp';
}

export const OPERATIONS_PLATFORM_OPTIONS: Platform[] = ['whatsapp', 'telegram'];
