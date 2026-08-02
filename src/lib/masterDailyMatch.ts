/** Normalisasi group_id WA untuk join master ↔ daily ↔ ticket. */
export function normalizeGroupIdForMatch(gid: string): string {
  const trimmed = gid.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.endsWith('@g.us')) return trimmed;
  if (/^\d+(-\d+)?@/i.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `${trimmed}@g.us`;
  return trimmed;
}

const TG_INVITE_PATH_BLOCKLIST = new Set([
  'joinchat',
  'addstickers',
  'share',
  'proxy',
  'socks',
  's',
  'c',
]);

/** True jika string terlihat seperti invite URL (WA / TG) — bukan group_id. */
export function looksLikeInviteLink(value: string | null | undefined): boolean {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return false;
  if (s.includes('chat.whatsapp.com/')) return true;
  if (/(?:^|\b)(?:https?:\/\/)?(?:t\.me|telegram\.me)\//i.test(s)) return true;
  return false;
}

/**
 * Kode invite ternormalisasi — match meski prefix URL beda.
 * WA: hash chat.whatsapp.com
 * TG private: t.me/+HASH / joinchat/HASH → tg:+hash
 * TG public: t.me/username → tg:@username
 */
export function normalizeInviteLinkForMatch(link: string | null | undefined): string {
  if (!link) return '';
  const s = link.trim().toLowerCase().replace(/\/+$/, '');
  const wa = s.match(/chat\.whatsapp\.com\/(?:invite\/)?([a-z0-9_-]+)/i);
  if (wa?.[1]) return wa[1];

  const tgPlus = s.match(/(?:t\.me|telegram\.me)\/\+([a-z0-9_-]+)/i);
  if (tgPlus?.[1]) return `tg:+${tgPlus[1]}`;

  const tgJoin = s.match(/(?:t\.me|telegram\.me)\/joinchat\/([a-z0-9_-]+)/i);
  if (tgJoin?.[1]) return `tg:+${tgJoin[1]}`;

  const tgUser = s.match(/(?:t\.me|telegram\.me)\/([a-z][a-z0-9_]{3,31})(?:[/?#]|$)/i);
  if (tgUser?.[1] && !TG_INVITE_PATH_BLOCKLIST.has(tgUser[1])) {
    return `tg:@${tgUser[1]}`;
  }

  return s;
}

export function normalizeGroupNameForMatch(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase();
}

export type MasterDailyRow = {
  group_id: string;
  group_name: string | null;
  invite_link: string | null;
  is_admin?: string;
};

export type DailyMatchIndexes = {
  byGroupId: Map<string, MasterDailyRow>;
  byInvite: Map<string, MasterDailyRow>;
  byName: Map<string, MasterDailyRow>;
};

export function buildDailyMatchIndexes(rows: MasterDailyRow[]): DailyMatchIndexes {
  const byGroupId = new Map<string, MasterDailyRow>();
  const byInvite = new Map<string, MasterDailyRow>();
  const byName = new Map<string, MasterDailyRow>();

  for (const row of rows) {
    const gid = String(row.group_id ?? '').trim();
    if (gid) {
      byGroupId.set(gid, row);
      const norm = normalizeGroupIdForMatch(gid);
      if (norm && !byGroupId.has(norm)) byGroupId.set(norm, row);
    }
    const inv = normalizeInviteLinkForMatch(row.invite_link);
    if (inv && !byInvite.has(inv)) byInvite.set(inv, row);
    const name = normalizeGroupNameForMatch(row.group_name);
    if (name && !byName.has(name)) byName.set(name, row);
  }

  return { byGroupId, byInvite, byName };
}

/** Cari baris daily untuk grup master — id, invite link, lalu nama. */
export function findDailyRowForMaster(
  master: Pick<MasterDailyRow, 'group_id' | 'group_name' | 'invite_link'>,
  indexes: DailyMatchIndexes,
): MasterDailyRow | undefined {
  const gid = String(master.group_id ?? '').trim();
  if (gid) {
    const byId =
      indexes.byGroupId.get(gid) ??
      indexes.byGroupId.get(normalizeGroupIdForMatch(gid));
    if (byId) return byId;
  }

  const inv = normalizeInviteLinkForMatch(master.invite_link);
  if (inv) {
    const byInv = indexes.byInvite.get(inv);
    if (byInv) return byInv;
  }

  const name = normalizeGroupNameForMatch(master.group_name);
  if (name) {
    const byNm = indexes.byName.get(name);
    if (byNm) return byNm;
  }

  return undefined;
}

/** Set group_id mentah (trim) — gap ticket daily↔master harus sama dengan grid Y/X. */
export function buildRawGroupIdSet(rows: Pick<MasterDailyRow, 'group_id'>[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    const gid = String(r.group_id ?? '').trim();
    if (gid) set.add(gid);
  }
  return set;
}

/** @deprecated alias — ticket gap pakai raw ID. */
export function buildMasterGroupIdSet(rows: Pick<MasterDailyRow, 'group_id'>[]): Set<string> {
  return buildRawGroupIdSet(rows);
}

export function isDailyGroupIdInMaster(dailyGroupId: string, masterIdSet: Set<string>): boolean {
  const gid = String(dailyGroupId ?? '').trim();
  return gid ? masterIdSet.has(gid) : false;
}

export function isMasterGroupIdInDaily(masterGroupId: string, dailyIdSet: Set<string>): boolean {
  const gid = String(masterGroupId ?? '').trim();
  return gid ? dailyIdSet.has(gid) : false;
}

/** Baris daily untuk master — hanya by group_id (bukan invite/nama). */
export function findDailyRowByGroupId(
  masterGroupId: string,
  indexes: DailyMatchIndexes,
): MasterDailyRow | undefined {
  const gid = String(masterGroupId ?? '').trim();
  if (!gid) return undefined;
  return (
    indexes.byGroupId.get(gid) ?? indexes.byGroupId.get(normalizeGroupIdForMatch(gid))
  );
}

export function buildDailyGroupIdSet(dailyRows: Pick<MasterDailyRow, 'group_id'>[]): Set<string> {
  return buildRawGroupIdSet(dailyRows);
}

export function isDailyRowInMasterSet(
  daily: MasterDailyRow,
  masterGids: Set<string>,
  masterIndexes: DailyMatchIndexes,
): boolean {
  const gid = String(daily.group_id ?? '').trim();
  if (gid && masterGids.has(gid)) return true;
  const gidNorm = normalizeGroupIdForMatch(gid);
  if (gidNorm && [...masterGids].some((m) => normalizeGroupIdForMatch(m) === gidNorm)) {
    return true;
  }
  const inv = normalizeInviteLinkForMatch(daily.invite_link);
  if (inv && masterIndexes.byInvite.has(inv)) return true;
  const name = normalizeGroupNameForMatch(daily.group_name);
  if (name && masterIndexes.byName.has(name)) return true;
  return false;
}
