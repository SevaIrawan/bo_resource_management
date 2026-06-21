import { GROUP_SCRAPE_SELECT } from '@/config/groupScrapeColumns';
import { MASTER_GROUP_SELECT } from '@/config/masterGroupColumns';

export const MESSAGING_ACCOUNT_SELECT =
  'id, user_id, brand_id, platform, label, phone_number, location_device, metadata, is_active, created_at, updated_at';

export const MESSAGING_ACCOUNT_MATCH_SELECT =
  'id, label, metadata, phone_number, location_device, brand_id';

export const BRAND_SELECT =
  'id, user_id, name, standard_group_count, empty_slot_count, is_active, metadata, created_at, updated_at';

export const ACCOUNT_SNAPSHOT_SELECT =
  'account_id, brand_id, platform, status, session_status, sync_state, groups_current, groups_total, admin_current, admin_total, is_misaligned, last_sync_at, updated_at';

export const DAILY_GROUP_SELECT = GROUP_SCRAPE_SELECT;
export { MASTER_GROUP_SELECT };

export const DAILY_PHONE_SELECT = 'id, phone_number, scrape_date, account_id';

export const TICKET_SELECT =
  'id, account_id, brand_id, platform, ticket_type, status, description, group_link, group_id, group_name, created_at, resolved_at, metadata, resource_management_messaging_accounts(label, phone_number, metadata), resource_management_brands(name)';
