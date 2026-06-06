import type { Platform } from '@/types/database';

export type AccountViewMode = 'card' | 'table';

export interface AccountSlicerState {
  viewMode: AccountViewMode;
  brand: string;
  platform: string;
  status: string;
  search: string;
}

export type AccountConnectionStatus = 'active' | 'logout';

export type AccountSyncState = 'pending' | 'synced';

export type SessionUiStatus = 'valid' | 'invalid';
export type AccountProcessAction = 'sync' | 'scraper' | 'session_check' | null;

export interface AccountBrandRow {
  id: string;
  platform: Platform;
  accountName: string;
  phoneNumber: string;
  brandName: string;
  status: AccountConnectionStatus;
  /** Y — jumlah grup di device (realtime) */
  groupsCurrent: number;
  /** X — total grup standar brand (dinamis) */
  groupsTotal: number;
  /** Admin di master untuk akun ini */
  adminCurrent: number;
  /** X — denominator admin (standar brand) */
  adminTotal: number;
  sessionStatus: SessionUiStatus;
  actionProcess: AccountProcessAction;
  syncState: AccountSyncState;
  isMisaligned: boolean;
  /** ISO timestamp — scrape/sync selesai (dari snapshot DB). */
  lastSyncAt?: string | null;
}

export interface AccountBrandEmptySlot {
  id: string;
  brandName: string;
}

export interface AccountBrandGroup {
  id: string;
  /** UUID di Supabase `resource_management_brands` */
  dbBrandId?: string;
  brandLabel: string;
  brandName: string;
  accountCount: number;
  /** @deprecated Gunakan standardGroupCountByPlatform — X per platform berbeda */
  standardGroupCount: number;
  /** X standar per platform (whatsapp / telegram) */
  standardGroupCountByPlatform: Partial<Record<Platform, number>>;
  misalignedCount: number;
  accounts: AccountBrandRow[];
  emptySlots: AccountBrandEmptySlot[];
}

export interface AddAccountInput {
  platform: Platform;
  accountName: string;
  phoneNumber?: string;
  slotId?: string;
  dbAccountId?: string;
}
