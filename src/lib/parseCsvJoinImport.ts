import * as XLSX from 'xlsx';
import { looksLikeInviteLink } from '@/lib/masterDailyMatch';

export interface CsvJoinRow {
  groupId?: string;
  groupName?: string;
  inviteLink?: string;
  /** Original line (for debug/display). */
  raw: string;
}

export interface ParseCsvJoinResult {
  rows: CsvJoinRow[];
  detectedColumns: string[];
}

/** Alias header — EN/ID/umum Excel export. */
const HEADER_GROUP_ID = [
  'group_id',
  'groupid',
  'id',
  'chat_id',
  'chatid',
  'peer_id',
  'peerid',
  'gid',
  'grup_id',
  'grupid',
];
const HEADER_GROUP_NAME = [
  'group_name',
  'groupname',
  'name',
  'group',
  'title',
  'grup',
  'nama',
  'nama_grup',
  'namagrup',
  'group_title',
];
const HEADER_INVITE_LINK = [
  'invite_link',
  'invitelink',
  'link',
  'url',
  'invite',
  'group_link',
  'grouplink',
  'undangan',
  'invite_url',
  'join_link',
  'joinlink',
];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function detectColumnIndex(headers: string[], candidates: string[]): number {
  // Exact normalized match dulu (hindari "Group ID" ketangkap sebagai group_name via substring "group").
  for (let i = 0; i < headers.length; i++) {
    const norm = normalizeHeader(headers[i]);
    if (candidates.includes(norm)) return i;
  }
  // Fuzzy hanya untuk alias panjang (≥8) — mis. invite_link dalam "Group Invite Link".
  for (let i = 0; i < headers.length; i++) {
    const norm = normalizeHeader(headers[i]);
    if (candidates.some((c) => c.length >= 8 && norm.includes(c))) return i;
  }
  return -1;
}

function detectDelimiter(line: string): string {
  let inQuotes = false;
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ',') commas += 1;
    else if (ch === ';') semis += 1;
    else if (ch === '\t') tabs += 1;
  }
  if (tabs >= commas && tabs >= semis && tabs > 0) return '\t';
  if (semis > commas) return ';';
  return ',';
}

function splitCsvLine(line: string, delimiter = ','): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function looksLikeHeader(cells: string[]): boolean {
  const normalized = cells.map(normalizeHeader).filter(Boolean);
  if (normalized.length === 0) return false;
  // Hanya exact alias header — JANGAN includes('group_name') (nama grup "WA Group Name"
  // jadi "wa_group_name" dan salah dianggap header → baris data dibuang).
  return normalized.some(
    (n) =>
      HEADER_GROUP_ID.includes(n) ||
      HEADER_GROUP_NAME.includes(n) ||
      HEADER_INVITE_LINK.includes(n),
  );
}

/** Peer / WA id yang bisa di-match ke master — bukan URL invite. */
export function looksLikeGroupId(value: string | null | undefined): boolean {
  const s = String(value ?? '').trim();
  if (!s || looksLikeInviteLink(s)) return false;
  // WA: 120363…@g.us atau 60146…-16128…@g.us
  if (/^\d+(-\d+)?@g\.us$/i.test(s)) return true;
  if (/^\d+(-\d+)?@lid$/i.test(s)) return true;
  // Super Group / Channel TG: -100…
  if (/^-100\d+$/.test(s)) return true;
  // Basic Chat / peer negatif lain
  if (/^-\d{5,}$/.test(s)) return true;
  // WA numeric id tanpa suffix
  if (/^\d{8,}$/.test(s)) return true;
  return false;
}

/**
 * Kontrak import hybrid: group name | group id | invite-only | campuran.
 * Cell invite URL → inviteLink; peer/WA id → groupId; sisanya → groupName.
 */
export function classifyJoinImportFields(input: {
  groupId?: string;
  groupName?: string;
  inviteLink?: string;
}): Pick<CsvJoinRow, 'groupId' | 'groupName' | 'inviteLink'> {
  let groupId = input.groupId?.trim() || undefined;
  let groupName = input.groupName?.trim() || undefined;
  let inviteLink = input.inviteLink?.trim() || undefined;

  if (!inviteLink && groupId && looksLikeInviteLink(groupId)) {
    inviteLink = groupId;
    groupId = undefined;
  }
  if (!inviteLink && groupName && looksLikeInviteLink(groupName)) {
    inviteLink = groupName;
    groupName = undefined;
  }
  if (groupId && looksLikeInviteLink(groupId)) {
    inviteLink = inviteLink || groupId;
    groupId = undefined;
  }
  if (groupName && looksLikeInviteLink(groupName) && groupName === inviteLink) {
    groupName = undefined;
  }
  if (groupName && looksLikeGroupId(groupName) && !groupId) {
    groupId = groupName;
    groupName = undefined;
  }
  // Header/map salah: groupName kebawa sama dengan groupId — buang duplikat.
  if (groupName && groupId && groupName === groupId) {
    groupName = undefined;
  }
  if (groupId && !looksLikeGroupId(groupId) && !looksLikeInviteLink(groupId) && !groupName) {
    groupName = groupId;
    groupId = undefined;
  }

  return { groupId, groupName, inviteLink };
}

/** Scan semua cell baris — urutan kolom bebas (hybrid / tanpa header rapi). */
export function absorbDetectableJoinCells(
  cells: string[],
): Pick<CsvJoinRow, 'groupId' | 'groupName' | 'inviteLink'> {
  let groupId: string | undefined;
  let groupName: string | undefined;
  let inviteLink: string | undefined;

  for (const raw of cells) {
    const v = String(raw ?? '').trim();
    if (!v) continue;
    if (looksLikeInviteLink(v)) {
      if (!inviteLink) inviteLink = v;
      continue;
    }
    if (looksLikeGroupId(v)) {
      if (!groupId) groupId = v;
      continue;
    }
    if (!groupName) groupName = v;
  }

  return classifyJoinImportFields({ groupId, groupName, inviteLink });
}

function mergePrefer(
  primary: Pick<CsvJoinRow, 'groupId' | 'groupName' | 'inviteLink'>,
  fallback: Pick<CsvJoinRow, 'groupId' | 'groupName' | 'inviteLink'>,
): Pick<CsvJoinRow, 'groupId' | 'groupName' | 'inviteLink'> {
  const groupId = primary.groupId || fallback.groupId;
  let groupName = primary.groupName || fallback.groupName;
  // Jika primary.groupName cuma mirror id (map kolom salah), ambil nama dari scan.
  if (groupName && groupId && groupName === groupId && fallback.groupName && fallback.groupName !== groupId) {
    groupName = fallback.groupName;
  }
  if (groupName && groupId && groupName === groupId) {
    groupName = undefined;
  }
  return classifyJoinImportFields({
    groupId,
    groupName,
    inviteLink: primary.inviteLink || fallback.inviteLink,
  });
}

function parseFromRows(allRows: string[][]): ParseCsvJoinResult {
  const MAX_ROWS = 500;
  if (allRows.length === 0) return { rows: [], detectedColumns: [] };

  const firstCells = allRows[0].map((c) => String(c ?? ''));
  const hasHeader = looksLikeHeader(firstCells);

  let idxGroupId = -1;
  let idxGroupName = -1;
  let idxInviteLink = -1;
  const detectedColumns: string[] = [];

  if (hasHeader) {
    idxGroupId = detectColumnIndex(firstCells, HEADER_GROUP_ID);
    idxGroupName = detectColumnIndex(firstCells, HEADER_GROUP_NAME);
    idxInviteLink = detectColumnIndex(firstCells, HEADER_INVITE_LINK);
    if (idxGroupId >= 0) detectedColumns.push('group_id');
    if (idxGroupName >= 0) detectedColumns.push('group_name');
    if (idxInviteLink >= 0) detectedColumns.push('invite_link');
  }

  const dataRows = hasHeader ? allRows.slice(1) : allRows;
  const rows: CsvJoinRow[] = [];
  const seenKinds = new Set<string>(detectedColumns);

  for (const cells of dataRows) {
    if (rows.length >= MAX_ROWS) break;

    const mapped =
      idxGroupId >= 0 || idxGroupName >= 0 || idxInviteLink >= 0
        ? classifyJoinImportFields({
            groupId: idxGroupId >= 0 ? String(cells[idxGroupId] ?? '').trim() || undefined : undefined,
            groupName:
              idxGroupName >= 0 ? String(cells[idxGroupName] ?? '').trim() || undefined : undefined,
            inviteLink:
              idxInviteLink >= 0 ? String(cells[idxInviteLink] ?? '').trim() || undefined : undefined,
          })
        : {};

    // Selalu scan seluruh cell — kolom acak / hybrid / tanpa header tetap terproses.
    const scanned = absorbDetectableJoinCells(cells.map((c) => String(c ?? '')));
    const classified = mergePrefer(mapped, scanned);

    if (!classified.groupId && !classified.groupName && !classified.inviteLink) continue;

    if (classified.groupId) seenKinds.add('group_id');
    if (classified.groupName) seenKinds.add('group_name');
    if (classified.inviteLink) seenKinds.add('invite_link');

    rows.push({
      ...classified,
      raw: cells.map((c) => String(c ?? '')).join(','),
    });
  }

  return { rows, detectedColumns: [...seenKinds] };
}

/**
 * Parse CSV text for join import.
 * Auto-detect delimiter (, ; tab), header, dan cell detectable di urutan bebas.
 * Max 500 rows enforced.
 */
export function parseCsvJoinText(text: string): ParseCsvJoinResult {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { rows: [], detectedColumns: [] };
  const delimiter = detectDelimiter(lines[0]);
  const allRows = lines.map((line) => splitCsvLine(line, delimiter));
  return parseFromRows(allRows);
}

/**
 * Parse XLSX/XLS ArrayBuffer for join import.
 * Reads the first sheet and auto-detects columns / cell types.
 */
export function parseXlsxJoinBuffer(buffer: ArrayBuffer): ParseCsvJoinResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], detectedColumns: [] };

  const sheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
  const allRows = jsonRows.map((row) => row.map((cell) => String(cell ?? '')));
  return parseFromRows(allRows);
}

/**
 * Parse file (CSV or XLSX) for join import.
 * Extension .xlsx/.xls → Excel; selain itu → CSV text (termasuk .csv / tanpa ekstensi).
 */
export async function parseJoinImportFile(file: File): Promise<ParseCsvJoinResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    return parseXlsxJoinBuffer(buffer);
  }
  // Excel kadang tanpa ekstensi benar — sniff ZIP/OLE signature.
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isZipXlsx = head[0] === 0x50 && head[1] === 0x4b;
  const isOleXls = head[0] === 0xd0 && head[1] === 0xcf;
  if (isZipXlsx || isOleXls) {
    const buffer = await file.arrayBuffer();
    return parseXlsxJoinBuffer(buffer);
  }
  const text = await file.text();
  return parseCsvJoinText(text);
}
