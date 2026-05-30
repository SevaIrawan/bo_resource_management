/**
 * Semua table project ini diawali resource_management_
 * Supabase shared dengan project lain — jangan ubah prefix.
 */
export const TABLES = {
  /** Tabel users existing di Supabase — JANGAN dibuat ulang oleh migration RM */
  users: 'users',
  userSessions: 'resource_management_user_sessions',
  sessionLogs: 'resource_management_session_logs',
  messagingAccounts: 'resource_management_messaging_accounts',
  platformSessions: 'resource_management_platform_sessions',
  platformSessionLogs: 'resource_management_platform_session_logs',
  scrapeLogs: 'resource_management_scrape_logs',
  groupScrapeDaily: 'resource_management_group_scrape_daily',
  groupsMaster: 'resource_management_groups_master',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];
