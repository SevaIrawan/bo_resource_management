/**
 * Tabel Supabase Resource Management — satu sumber nama tabel.
 */
export const TABLES = {
  users: 'users',
  brands: 'resource_management_brands',
  messagingAccounts: 'resource_management_messaging_accounts',
  platformSessions: 'resource_management_platform_sessions',
  platformSessionLogs: 'resource_management_platform_session_logs',
  scrapeRuns: 'resource_management_scrape_runs',
  groupScrapeDaily: 'resource_management_group_scrape_daily',
  groupsMaster: 'resource_management_groups_master',
  accountSnapshots: 'resource_management_account_snapshots',
  tickets: 'resource_management_tickets',
} as const;

/** Tabel RM + Realtime publication (017). */
export const RM_REALTIME_TABLES = [
  TABLES.platformSessions,
  TABLES.accountSnapshots,
  TABLES.scrapeRuns,
  TABLES.tickets,
  TABLES.messagingAccounts,
  TABLES.brands,
] as const;

export const RM_ACTIVE_TABLES = [
  TABLES.brands,
  TABLES.messagingAccounts,
  TABLES.platformSessions,
  TABLES.platformSessionLogs,
  TABLES.scrapeRuns,
  TABLES.groupScrapeDaily,
  TABLES.groupsMaster,
  TABLES.accountSnapshots,
  TABLES.tickets,
] as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];
