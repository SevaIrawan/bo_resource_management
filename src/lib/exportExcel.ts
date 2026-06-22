import * as XLSX from 'xlsx';
import type { AccountGroupLinkRow } from '@/lib/accountGroupLinks';
import type { GroupLinksViewMode } from '@/components/group-monitoring/GroupLinksPickerModal';
import type { TicketDetailLine } from '@/lib/ticketGroups';
import { ticketGroupToExportRows } from '@/lib/ticketExportRows';
import { ticketTypeExportLabel, type TicketSummaryGroup } from '@/lib/ticketGroups';
import type { JoinGroupMatrixRow, ReportingAccountRef } from '@/lib/loadJoinGroupReport';
import { formatLastSyncAt } from '@/lib/formatLastSync';
import type { OperationsStockDetailRow } from '@/lib/loadOperationsStockBucketDetails';
import { REPORTING_STOCK_EXPORT_LABEL } from '@/lib/reportingStockStatus';
import type { GroupStockBucket } from '@/types/groupStock';
import { reportingAccountDisplayName } from '@/lib/reportingDisplayName';
import type { AccountBrandGroup, AccountBrandRow } from '@/types/accountMonitoringUi';
import type { Platform } from '@/types/database';
import type {
  JobQueueViewTableColumnId,
  JobQueueViewTableRow,
} from '@/lib/operationsJobQueueUi';
import type { AutomationJobAction } from '@/types/automationJob';

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

/** Operations stock bucket modal — kolom sama dengan UI detail table. */
export function exportOperationsStockBucketExcel(input: {
  brandName: string;
  platform: Platform;
  bucket: GroupStockBucket;
  rows: OperationsStockDetailRow[];
  locale?: string;
}) {
  const plat = input.platform === 'whatsapp' ? 'WA' : 'TG';
  const bucketLabel = REPORTING_STOCK_EXPORT_LABEL[input.bucket];
  const sheet = XLSX.utils.json_to_sheet(
    input.rows.map((row) => ({
      'Group Name': row.groupName,
      'Group ID': row.groupId || '—',
      'Non-admin': row.memberNonAdmin,
      'Invite Link': row.inviteLink ?? '',
      'Last sync': formatLastSyncAt(row.lastSync, input.locale),
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, bucketLabel);
  saveWorkbook(workbook, rmExportFileName(`${input.brandName}_${bucketLabel}-${plat}_stock`));
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

export type ReportingExportBookmark = 'full_group' | 'full_admin';

/** Metadata slicer aktif — dipakai nama file & validasi export reporting. */
export type ReportingExportMeta = {
  brandName: string;
  platform: Platform;
  bookmark: ReportingExportBookmark;
  accountScope: 'all' | 'single';
  accountDisplayName?: string;
};

function reportingExportFileName(meta: ReportingExportMeta): string {
  const plat = meta.platform === 'whatsapp' ? 'WA' : 'TG';
  const bookmark = meta.bookmark === 'full_admin' ? 'FullAdmin' : 'FullGroup';
  const acc =
    meta.accountScope === 'all' ? 'All' : safeFilePart(meta.accountDisplayName ?? 'account');
  return `RM-${safeFilePart(meta.brandName)}-${plat}-${bookmark}-${acc}-${stamp()}.xlsx`;
}

function reportingSheetLabel(meta: ReportingExportMeta): string {
  if (meta.accountScope === 'all') {
    return meta.bookmark === 'full_admin' ? 'Admin matrix' : 'Join matrix';
  }
  return meta.bookmark === 'full_admin' ? 'Admin daily' : 'Group daily';
}

/** Full Group — satu akun: kolom sama dengan UI reporting daily. */
export function exportReportingDailyExcel(input: {
  meta: ReportingExportMeta;
  rows: AccountGroupLinkRow[];
}) {
  const sheet = XLSX.utils.json_to_sheet(
    input.rows.map((row, index) => ({
      No: index + 1,
      'Group Name': row.groupName,
      'Group ID': row.groupId,
      'Member Count': row.memberCount,
      'Admin Count': row.adminCount,
      'Is Admin': row.isAdmin === 'yes' ? 'Yes' : 'No',
      'Group Link': row.inviteLink ?? '',
      Status: REPORTING_STOCK_EXPORT_LABEL[row.stockStatus ?? 'other'],
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, reportingSheetLabel(input.meta));
  saveWorkbook(workbook, reportingExportFileName(input.meta));
}

/** Full Admin — satu akun: kolom sama dengan UI reporting admin daily. */
export function exportReportingAdminDailyExcel(input: {
  meta: ReportingExportMeta;
  rows: AccountGroupLinkRow[];
}) {
  const sheet = XLSX.utils.json_to_sheet(
    input.rows.map((row, index) => ({
      No: index + 1,
      'Group Name': row.groupName,
      'Group ID': row.groupId,
      'Group Link': row.inviteLink ?? '',
      Status: REPORTING_STOCK_EXPORT_LABEL[row.stockStatus ?? 'other'],
      'Is Admin': row.isAdmin === 'yes' ? 'Yes' : 'No',
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, reportingSheetLabel(input.meta));
  saveWorkbook(workbook, reportingExportFileName(input.meta));
}

/** All accounts — matriks join atau admin sesuai bookmark aktif. */
export function exportReportingMatrixExcel(input: {
  meta: ReportingExportMeta;
  accounts: ReportingAccountRef[];
  rows: JoinGroupMatrixRow[];
}) {
  const mode = input.meta.bookmark === 'full_admin' ? 'admin' : 'join';
  const sheet = XLSX.utils.json_to_sheet(
    input.rows.map((row, index) => {
      const base: Record<string, string | number> = {
        No: index + 1,
        'Group Name': row.groupName,
        'Group ID': row.groupId,
        'Group Link': row.inviteLink ?? '',
        Status: REPORTING_STOCK_EXPORT_LABEL[row.stockStatus ?? 'other'],
      };
      for (const acc of input.accounts) {
        const active =
          mode === 'admin' ? row.adminByAccountId[acc.id] : row.joinByAccountId[acc.id];
        base[reportingAccountDisplayName(acc.accountName, input.meta.brandName)] = active
          ? 'Yes'
          : 'No';
      }
      return base;
    }),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, reportingSheetLabel(input.meta));
  saveWorkbook(workbook, reportingExportFileName(input.meta));
}

/** Job queue VIEW modal — kolom sama dengan tabel detail per task type. */
export function exportJobQueueViewExcel(input: {
  accountName: string;
  action: AutomationJobAction;
  columns: JobQueueViewTableColumnId[];
  columnLabels: string[];
  rows: JobQueueViewTableRow[];
}) {
  const actionPart =
    input.action === 'join_by_invite_link'
      ? 'join'
      : input.action === 'create_group'
        ? 'create'
        : 'set-admin';
  const sheet = XLSX.utils.json_to_sheet(
    input.rows.map((row) => {
      const record: Record<string, string> = {};
      input.columns.forEach((col, index) => {
        record[input.columnLabels[index]] = row[col];
      });
      return record;
    }),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Job result');
  saveWorkbook(workbook, rmExportFileName(`${input.accountName}_job-${actionPart}`));
}

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
