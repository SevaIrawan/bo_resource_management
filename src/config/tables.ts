/**
 * Tabel Supabase Resource Management — satu sumber nama tabel.
 */
export const TABLES = {
  users: 'users',
  brands: 'resource_management_brands',
  messagingAccounts: 'resource_management_messaging_accounts',
  platformSessions: 'resource_management_platform_sessions',
  platformSessionLogs: 'resource_management_platform_session_logs',
  syncActivityLogs: 'resource_management_sync_activity_logs',
  scrapeRuns: 'resource_management_scrape_runs',
  groupScrapeDaily: 'resource_management_group_scrape_daily',
  groupsMaster: 'resource_management_groups_master',
  accountSnapshots: 'resource_management_account_snapshots',
  tickets: 'resource_management_tickets',
  ticketIssueHandles: 'resource_management_ticket_issue_handles',
} as const;

/** Tabel RM + Realtime publication (017). */
export const RM_REALTIME_TABLES = [
  TABLES.platformSessions,
  TABLES.platformSessionLogs,
  TABLES.accountSnapshots,
  TABLES.scrapeRuns,
  TABLES.tickets,
  TABLES.ticketIssueHandles,
  TABLES.messagingAccounts,
  TABLES.brands,
  TABLES.groupsMaster,
  TABLES.groupScrapeDaily,
] as const;

export const RM_ACTIVE_TABLES = [
  TABLES.brands,
  TABLES.messagingAccounts,
  TABLES.platformSessions,
  TABLES.platformSessionLogs,
  TABLES.syncActivityLogs,
  TABLES.scrapeRuns,
  TABLES.groupScrapeDaily,
  TABLES.groupsMaster,
  TABLES.accountSnapshots,
  TABLES.tickets,
  TABLES.ticketIssueHandles,
] as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];
