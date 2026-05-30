import type { Platform } from '@/types/database';

export type AccountViewMode = 'card' | 'table';

export interface AccountSlicerState {
  viewMode: AccountViewMode;
  brand: string;
  platform: string;
  status: string;
  adminStatus: string;
  search: string;
}

export type AccountConnectionStatus = 'active' | 'logout';

export type AccountSyncState = 'pending' | 'synced';

export interface AccountBrandRow {
  id: string;
  platform: Platform;
  accountName: string;
  phoneOrUsername: string;
  brandName: string;
  status: AccountConnectionStatus;
  groupsCurrent: number;
  groupsTotal: number;
  adminCurrent: number;
  adminTotal: number;
  /** pending = baru ditambah user, kolom monitoring kosong sampai Sync */
  syncState: AccountSyncState;
}

export interface AccountBrandEmptySlot {
  id: string;
  brandName: string;
}

export interface AccountBrandGroup {
  id: string;
  brandLabel: string;
  brandName: string;
  accountCount: number;
  standardGroupCount: number;
  misalignedCount: number;
  accounts: AccountBrandRow[];
  emptySlots: AccountBrandEmptySlot[];
}

export interface AddAccountInput {
  platform: Platform;
  accountName: string;
  phoneOrUsername?: string;
  slotId?: string;
  dbAccountId?: string;
}
