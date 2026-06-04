import * as XLSX from 'xlsx';
import type { AccountGroupLinkRow } from '@/lib/accountGroupLinks';
import type { TicketDetailLine } from '@/lib/ticketGroups';
import { ticketGroupToExportRows } from '@/lib/ticketExportRows';
import { ticketTypeExportLabel, type TicketSummaryGroup } from '@/lib/ticketGroups';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
function stamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function saveWorkbook(workbook: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

function accountRowsForExport(rows: AccountBrandRow[]) {
  return rows.map((row) => ({
    Brand: row.brandName,
    Account: row.accountName,
    Platform: row.platform === 'whatsapp' ? 'WhatsApp' : 'Telegram',
    Phone: row.phoneNumber || '',
    Status: row.syncState === 'pending' ? 'Pending sync' : row.status,
    Groups: row.syncState === 'pending' ? '' : `${row.groupsCurrent}/${row.groupsTotal}`,
    Admin: row.syncState === 'pending' ? '' : `${row.adminCurrent}/${row.adminTotal}`,
    'Group link': '',
  }));
}

function safeFilePart(value: string) {
  return value.replace(/[^\w.-]+/g, '_') || 'x';
}

export function exportGroupLinksExcel(input: {
  brandName: string;
  accountName: string;
  rows: AccountGroupLinkRow[];
}) {
  const safeBrand = safeFilePart(input.brandName);
  const safeAcc = safeFilePart(input.accountName);
  const sheet = XLSX.utils.json_to_sheet(
    input.rows.map((row) => ({
      'Group Name': row.groupName,
      'Group ID': row.groupId,
      'Group/Invite Link': row.inviteLink ?? '',
      'Is Admin': row.isAdmin === 'yes' ? 'Yes' : 'No',
      'In master': row.inMaster ? 'Yes' : 'No',
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Group links');
  saveWorkbook(workbook, `RM-${safeBrand}-${safeAcc}-groups-${stamp()}.xlsx`);
}

export function exportBrandMasterGroupsExcel(input: {
  brandName: string;
  platform: 'whatsapp' | 'telegram';
  rows: { groupName: string; groupId: string; inviteLink: string | null; lastSync: string | null }[];
}) {
  const safeBrand = safeFilePart(input.brandName);
  const plat = input.platform === 'whatsapp' ? 'WA' : 'TG';
  const sheet = XLSX.utils.json_to_sheet(
    input.rows.map((row) => ({
      'Group Name': row.groupName,
      'Group ID': row.groupId,
      'Invite Link': row.inviteLink ?? '',
      'Last sync': row.lastSync ?? '',
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Master groups');
  saveWorkbook(workbook, `RM-${safeBrand}-${plat}-master-${stamp()}.xlsx`);
}

export function exportAllAccountsExcel(groups: AccountBrandGroup[]) {
  const rows = groups.flatMap((group) => group.accounts);
  const sheet = XLSX.utils.json_to_sheet(accountRowsForExport(rows));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'All accounts');
  saveWorkbook(workbook, `RM-all-accounts-${stamp()}.xlsx`);
}

/** Export satu issue (semua baris detail dalam kelompok acc+brand+jenis). */
export function exportTicketGroupExcel(
  group: TicketSummaryGroup,
  typeLabel = ticketTypeExportLabel(group.ticketType),
  formatNote?: (line: TicketDetailLine) => string,
) {
  const safeBrand = safeFilePart(group.brandName);
  const safeAcc = safeFilePart(group.accountName);
  const type = safeFilePart(typeLabel);
  const sheet = XLSX.utils.json_to_sheet(
    ticketGroupToExportRows(group, typeLabel, formatNote),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Issue detail');
  saveWorkbook(
    workbook,
    `RM-${safeBrand}-${safeAcc}-${type}-${stamp()}.xlsx`,
  );
}

/** Export semua issue terbuka (detail per baris, dengan kolom jenis issue). */
export function exportAllTicketGroupsExcel(
  groups: TicketSummaryGroup[],
  resolveTypeLabel: (group: TicketSummaryGroup) => string = (g) =>
    ticketTypeExportLabel(g.ticketType),
  formatNote?: (group: TicketSummaryGroup, line: TicketDetailLine) => string,
) {
  const rows = groups.flatMap((group) =>
    ticketGroupToExportRows(
      group,
      resolveTypeLabel(group),
      formatNote ? (line) => formatNote(group, line) : undefined,
    ),
  );
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'All issues');
  saveWorkbook(workbook, `RM-all-tickets-${stamp()}.xlsx`);
}
