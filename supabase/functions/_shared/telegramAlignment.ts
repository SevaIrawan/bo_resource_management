// Logic murni (tanpa DB / network) untuk hitung Full Group, Full Admin, Junk.
// Dipisah dari index.ts supaya gampang di-unit-test.

export type DailyRow = {
  account_label: string;
  group_id: string;
  group_name: string | null;
  invite_link: string | null;
  is_admin: string | null; // 'yes' | 'no'
  is_owner: string | null; // 'yes' | 'no'
};

export type MasterRow = {
  group_id: string;
  group_name: string | null;
  invite_link: string | null;
};

/**
 * Super Group vs Basic Group — SATU SUMBER KEBENARAN sama seperti
 * src/lib/telegramGroupKind.ts di aplikasi GM Apps.
 * Channel/supergroup -> id diawali "-100", basic chat -> tidak.
 */
export function isSuperGroup(groupId: string): boolean {
  return String(groupId ?? '').trim().startsWith('-100');
}

function superGroupLabel(groupId: string): 'Yes' | 'No' {
  return isSuperGroup(groupId) ? 'Yes' : 'No';
}

export type FullMatrixRow = {
  group_name: string;
  group_id: string;
  super_group: 'Yes' | 'No';
  group_link: string;
  perAccount: Record<string, 'Yes' | 'No'>;
};

/**
 * Full Group / Full Admin matrix.
 * mode 'join'  -> Yes jika group_id itu ada di daily scrape akun tsb
 * mode 'admin' -> Yes jika is_admin = 'yes' di daily scrape akun tsb
 */
export function buildFullMatrix(
  master: MasterRow[],
  daily: DailyRow[],
  accounts: string[],
  mode: 'join' | 'admin',
): FullMatrixRow[] {
  // acc_name di DB adalah label LENGKAP akun (mis. "STMY LINA STARMAX"),
  // sedangkan `accounts` di config cuma nama pendek (mis. "Lina").
  // Jadi matching-nya pakai "mengandung kata" (case-insensitive), bukan sama persis.
  const matchesAccount = (accName: string, shortLabel: string) =>
    accName.toUpperCase().includes(shortLabel.toUpperCase());

  // index: account pendek -> group_id -> daily row (kalau lebih dari 1 baris nyantol, ambil yang pertama ketemu)
  const byAccountGroup = new Map<string, Map<string, DailyRow>>();
  for (const acc of accounts) byAccountGroup.set(acc, new Map());
  for (const row of daily) {
    const gid = String(row.group_id).trim();
    for (const acc of accounts) {
      if (!matchesAccount(row.account_label, acc)) continue;
      const m = byAccountGroup.get(acc)!;
      if (!m.has(gid)) m.set(gid, row);
    }
  }

  return master.map((m) => {
    const perAccount: Record<string, 'Yes' | 'No'> = {};
    for (const acc of accounts) {
      const row = byAccountGroup.get(acc)?.get(String(m.group_id).trim());
      if (mode === 'join') {
        perAccount[acc] = row ? 'Yes' : 'No';
      } else {
        perAccount[acc] = row && String(row.is_admin).toLowerCase() === 'yes' ? 'Yes' : 'No';
      }
    }
    return {
      group_name: m.group_name ?? '',
      group_id: m.group_id,
      super_group: superGroupLabel(m.group_id),
      group_link: m.invite_link ?? '',
      perAccount,
    };
  });
}

export type JunkRow = {
  account_source: string;
  group_name: string;
  group_id: string;
  super_group: 'Yes' | 'No';
  invite_link: string;
  admin: 'Yes' | 'No';
  owner: 'Yes' | 'No';
  recommend: 'Delete' | 'Review';
};

/**
 * Junk = baris daily yang group_id-nya TIDAK ada di master brand tsb.
 * Recommend "Delete" kalau group_name mengandung nama brand DAN kata "NEW" (case-insensitive).
 * Selain itu "Review".
 */
export function buildJunk(
  master: MasterRow[],
  daily: DailyRow[],
  brand: string,
): JunkRow[] {
  const masterIds = new Set(master.map((m) => String(m.group_id).trim()));
  const out: JunkRow[] = [];

  for (const row of daily) {
    const gid = String(row.group_id).trim();
    if (masterIds.has(gid)) continue; // ada di master -> bukan junk

    const name = row.group_name ?? '';
    const nameUpper = name.toUpperCase();
    const isDelete =
      nameUpper.includes(brand.toUpperCase()) && nameUpper.includes('NEW');

    out.push({
      account_source: row.account_label,
      group_name: name,
      group_id: gid,
      super_group: superGroupLabel(gid),
      invite_link: row.invite_link ?? '',
      admin: String(row.is_admin).toLowerCase() === 'yes' ? 'Yes' : 'No',
      owner: String(row.is_owner).toLowerCase() === 'yes' ? 'Yes' : 'No',
      recommend: isDelete ? 'Delete' : 'Review',
    });
  }

  return out;
}
