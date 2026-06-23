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
  /** Metrik bisnis harian — line = brand RM, bukan tabel RM core. */
  newRegister: 'new_register',
  accountSnapshots: 'resource_management_account_snapshots',
} as const;

/** Tabel RM + Realtime publication (017). */
export const RM_REALTIME_TABLES = [
  TABLES.platformSessions,
  TABLES.platformSessionLogs,
  TABLES.accountSnapshots,
  TABLES.scrapeRuns,
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
] as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];
