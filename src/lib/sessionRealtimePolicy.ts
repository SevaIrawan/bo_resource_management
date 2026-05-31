/** Akun yang baru login — jangan invalidate dari probe/Realtime background. */
const loginGraceUntil = new Map<string, number>();

const GRACE_MS = 120_000;

export function markAccountLoginGrace(accountId: string, ms = GRACE_MS): void {
  loginGraceUntil.set(accountId, Date.now() + ms);
}

export function isAccountInLoginGrace(accountId: string): boolean {
  const until = loginGraceUntil.get(accountId);
  if (!until) return false;
  if (Date.now() > until) {
    loginGraceUntil.delete(accountId);
    return false;
  }
  return true;
}

export function clearAccountLoginGrace(accountId: string): void {
  loginGraceUntil.delete(accountId);
}
