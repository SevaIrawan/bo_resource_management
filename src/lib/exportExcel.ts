import * as XLSX from 'xlsx';
import type { AccountGroupLinkRow } from '@/lib/accountGroupLinks';
import type { GroupLinksViewMode } from '@/components/group-monitoring/GroupLinksPickerModal';
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
    'On device': row.syncState === 'pending' ? '' : row.groupsCurrent,
    'In brand': row.syncState === 'pending' ? '' : `${row.joinedInMaster}/${row.groupsTotal}`,
    Admin: row.syncState === 'pending' ? '' : `${row.adminCurrent}/${row.adminTotal}`,
    'Group link': '',
  }));
}

function safeFilePart(value: string) {
  return value.replace(/[^\w.-]+/g, '_') || 'x';
}

/** Konvensi nama file export: RM-[acc name]-YYYYMMDD.xlsx (acc name sudah mengandung brand). */
function rmExportFileName(name: string): string {
  return `RM-${safeFilePart(name)}-${stamp()}.xlsx`;
}

export function exportGroupLinksExcel(input: {
  brandName: string;
  accountName: string;
  rows: AccountGroupLinkRow[];
  viewMode?: GroupLinksViewMode;
}) {
  const sheet =
    input.viewMode === 'account'
      ? XLSX.utils.json_to_sheet(
          input.rows.map((row, index) => ({
            No: index + 1,
            'Group Name': row.groupName,
            'Group ID': row.groupId,
            'Member Count': row.memberCount,
            'Admin Count': row.adminCount,
            'Is Admin': row.isAdmin === 'yes' ? 'Yes' : 'No',
            'Invite Link': row.inviteLink ?? '',
          })),
        )
      : XLSX.utils.json_to_sheet(
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
  saveWorkbook(workbook, rmExportFileName(input.accountName));
}

export function exportBrandMasterGroupsExcel(input: {
  brandName: string;
  platform: 'whatsapp' | 'telegram';
  rows: { groupName: string; groupId: string; inviteLink: string | null; lastSync: string | null }[];
}) {
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
  saveWorkbook(workbook, rmExportFileName(`${input.brandName}_master-${plat}`));
}

export function exportAllAccountsExcel(groups: AccountBrandGroup[]) {
  const rows = groups.flatMap((group) => group.accounts);
  const sheet = XLSX.utils.json_to_sheet(accountRowsForExport(rows));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'All accounts');
  saveWorkbook(workbook, rmExportFileName('all-accounts'));
}

/** Export satu issue (semua baris detail dalam kelompok acc+brand+jenis). */
export function exportTicketGroupExcel(
  group: TicketSummaryGroup,
  typeLabel = ticketTypeExportLabel(group.ticketType),
  formatNote?: (line: TicketDetailLine) => string,
) {
  const sheet = XLSX.utils.json_to_sheet(
    ticketGroupToExportRows(group, typeLabel, formatNote),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Issue detail');
  saveWorkbook(workbook, rmExportFileName(group.accountName));
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
  saveWorkbook(workbook, rmExportFileName('all-tickets'));
}
