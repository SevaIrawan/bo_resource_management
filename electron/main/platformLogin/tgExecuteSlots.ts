/**
 * Kuota execute Telegram (sidecar/Telethon) — terpisah dari pool Chrome WA.
 * Default 10; tidak saling potong dengan WhatsApp.
 */
import {
  DEFAULT_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM,
  HARD_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM,
} from '../../../src/config/deviceConcurrencyPolicy';

function readMaxSlots(): number {
  const raw = process.env.RM_TG_MAX_CONCURRENT_SLOTS;
  if (!raw) return DEFAULT_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM;
  return Math.min(n, HARD_MAX_USER_EXECUTE_SLOTS_PER_PLATFORM);
}

export function getMaxTgExecuteSlots(): number {
  return readMaxSlots();
}
