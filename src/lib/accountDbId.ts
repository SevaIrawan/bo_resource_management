const UUID_RE = /^[0-9a-f-]{36}$/i;

/** UUID `messaging_accounts.id` dari baris grid atau `acc-{uuid}` slot lokal. */
export function normalizeDbAccountId(accountId: string): string | null {
  const trimmed = accountId.trim();
  if (UUID_RE.test(trimmed)) return trimmed;
  if (trimmed.startsWith('acc-')) {
    const id = trimmed.slice(4);
    return UUID_RE.test(id) ? id : null;
  }
  return null;
}

export function isLocalAccountSlotId(accountId: string): boolean {
  return accountId.trim().startsWith('acc-');
}
