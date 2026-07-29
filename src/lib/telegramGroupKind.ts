/**
 * Deteksi Super Group vs Basic Group dari peer id Telegram (yang RM simpan sebagai group_id).
 * Channel/supergroup → `-100…`; basic Chat → negatif tanpa `-100`.
 * UI-only — tanpa kolom DB master/daily.
 *
 * Satu sumber kebenaran untuk semua matrix / modal / export / Job Queue.
 */
export type TelegramSuperGroupYesNo = 'Yes' | 'No' | '—';

export function isTelegramSuperGroupId(groupId: string | null | undefined): boolean {
  return String(groupId ?? '').trim().startsWith('-100');
}

/** Nilai kanonik EN untuk cell / export / field row. */
export function telegramSuperGroupYesNo(
  groupId: string | null | undefined,
): TelegramSuperGroupYesNo {
  const id = String(groupId ?? '').trim();
  if (!id || id === '—') return '—';
  return isTelegramSuperGroupId(id) ? 'Yes' : 'No';
}

/** Localized Yes/No dari groupId (satu path render UI). */
export function telegramSuperGroupLabel(
  groupId: string | null | undefined,
  labels: { yes: string; no: string },
): string {
  return localizeTelegramSuperGroupYesNo(telegramSuperGroupYesNo(groupId), labels);
}

/** Localized dari nilai kanonik Yes/No/— (row.superGroup / export). */
export function localizeTelegramSuperGroupYesNo(
  value: string | null | undefined,
  labels: { yes: string; no: string },
): string {
  if (value === 'Yes') return labels.yes;
  if (value === 'No') return labels.no;
  return '—';
}
