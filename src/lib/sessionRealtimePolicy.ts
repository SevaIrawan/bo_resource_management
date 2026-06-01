/** Akun yang baru login / baru scrape — jangan invalidate UI dari event device. */
const loginGraceUntil = new Map<string, number>();
const scrapeGraceUntil = new Map<string, number>();

const GRACE_MS = 120_000;

function isInGrace(map: Map<string, number>, accountId: string): boolean {
  const until = map.get(accountId);
  if (!until) return false;
  if (Date.now() > until) {
    map.delete(accountId);
    return false;
  }
  return true;
}

function markGrace(map: Map<string, number>, accountId: string, ms: number): void {
  map.set(accountId, Date.now() + ms);
}

export function markAccountLoginGrace(accountId: string, ms = GRACE_MS): void {
  markGrace(loginGraceUntil, accountId, ms);
}

export function isAccountInLoginGrace(accountId: string): boolean {
  return isInGrace(loginGraceUntil, accountId);
}

export function clearAccountLoginGrace(accountId: string): void {
  loginGraceUntil.delete(accountId);
}

export function markAccountScrapeGrace(accountId: string, ms = GRACE_MS): void {
  markGrace(scrapeGraceUntil, accountId, ms);
}

export function isAccountInScrapeGrace(accountId: string): boolean {
  return isInGrace(scrapeGraceUntil, accountId);
}

/** Login atau scrape baru selesai — abaikan event invalid sementara. */
export function isAccountInSessionGrace(accountId: string): boolean {
  return isAccountInLoginGrace(accountId) || isAccountInScrapeGrace(accountId);
}
