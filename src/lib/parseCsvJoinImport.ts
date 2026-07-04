import * as XLSX from 'xlsx';

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

const HEADER_GROUP_ID = ['group_id', 'groupid', 'id'];
const HEADER_GROUP_NAME = ['group_name', 'groupname', 'name', 'group'];
const HEADER_INVITE_LINK = ['invite_link', 'invitelink', 'link', 'url', 'invite', 'group_link', 'grouplink'];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function detectColumnIndex(
  headers: string[],
  candidates: string[],
): number {
  for (let i = 0; i < headers.length; i++) {
    const norm = normalizeHeader(headers[i]);
    if (candidates.includes(norm)) return i;
  }
  return -1;
}

function splitCsvLine(line: string): string[] {
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
    } else if (ch === ',' && !inQuotes) {
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
  const normalized = cells.map(normalizeHeader);
  return normalized.some(
    (n) =>
      HEADER_GROUP_ID.includes(n) ||
      HEADER_GROUP_NAME.includes(n) ||
      HEADER_INVITE_LINK.includes(n),
  );
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
  } else {
    idxGroupId = 0;
    detectedColumns.push('group_id');
    if (firstCells.length >= 2) {
      idxGroupName = 1;
      detectedColumns.push('group_name');
    }
    if (firstCells.length >= 3) {
      idxInviteLink = 2;
      detectedColumns.push('invite_link');
    }
  }

  const dataRows = hasHeader ? allRows.slice(1) : allRows;
  const rows: CsvJoinRow[] = [];

  for (const cells of dataRows) {
    if (rows.length >= MAX_ROWS) break;
    const groupId = idxGroupId >= 0 ? String(cells[idxGroupId] ?? '').trim() : undefined;
    const groupName = idxGroupName >= 0 ? String(cells[idxGroupName] ?? '').trim() : undefined;
    const inviteLink = idxInviteLink >= 0 ? String(cells[idxInviteLink] ?? '').trim() : undefined;

    if (!groupId && !groupName && !inviteLink) continue;

    rows.push({
      groupId: groupId || undefined,
      groupName: groupName || undefined,
      inviteLink: inviteLink || undefined,
      raw: cells.map((c) => String(c ?? '')).join(','),
    });
  }

  return { rows, detectedColumns };
}

/**
 * Parse CSV text for join import.
 * Auto-detects columns from header row. If no recognizable header,
 * treats first column as group_id.
 * Max 500 rows enforced.
 */
export function parseCsvJoinText(text: string): ParseCsvJoinResult {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  const allRows = lines.map(splitCsvLine);
  return parseFromRows(allRows);
}

/**
 * Parse XLSX/XLS ArrayBuffer for join import.
 * Reads the first sheet and auto-detects columns.
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
 * Detects format from file extension or content.
 */
export async function parseJoinImportFile(file: File): Promise<ParseCsvJoinResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    return parseXlsxJoinBuffer(buffer);
  }
  const text = await file.text();
  return parseCsvJoinText(text);
}
