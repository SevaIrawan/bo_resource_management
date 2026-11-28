import {
  computeAccountTicketBreakdown,
  loadMasterDailyForAccount,
} from '@/lib/accountMasterDailyCompare';
import { groupVisibleInBatch } from '@/lib/waAccountBatch';
import type { Platform } from '@/types/database';

export interface MissingMasterGroupForJoin {
  groupId: string;
  groupName: string;
  inviteLink: string;
}

export interface MissingMasterGroupsJoinSnapshot {
  /** Missing master rows with valid invite_link — boleh di-queue. */
  joinable: MissingMasterGroupForJoin[];
  /** Missing master tapi invite_link kosong di groups_master. */
  missingWithoutInviteLink: number;
}

/** Grup master brand+platform yang belum ada di daily akun — selaras ticket missing_group. */
export async function loadMissingMasterGroupsJoinSnapshot(input: {
  accountId: string;
  brandName: string;
  platform: Platform;
  /** New Acc: hanya grup batch ini. Null = Old Acc / Telegram. */
  onlyBatch?: string | null;
}): Promise<MissingMasterGroupsJoinSnapshot> {
  const brand = input.brandName.trim();
  if (!brand) return { joinable: [], missingWithoutInviteLink: 0 };

  const { masterRows, dailyRows } = await loadMasterDailyForAccount({
    accountId: input.accountId,
    brandName: brand,
    platform: input.platform,
  });
  const breakdown = computeAccountTicketBreakdown(masterRows, dailyRows);
  const batchByGroupId = new Map(
    masterRows.map((row) => [String(row.group_id ?? '').trim(), row.batch ?? null]),
  );

  let missingWithoutInviteLink = 0;
  const joinable: MissingMasterGroupForJoin[] = [];

  for (const row of breakdown.missing) {
    if (
      input.onlyBatch &&
      !groupVisibleInBatch(batchByGroupId.get(row.groupId.trim()) ?? null, input.onlyBatch)
    ) {
      continue;
    }
    const groupId = row.groupId.trim();
    if (!groupId) continue;
    const inviteLink = (row.groupLink ?? '').trim();
    if (!inviteLink) {
      missingWithoutInviteLink += 1;
      continue;
    }
    joinable.push({
      groupId,
      groupName: (row.groupName ?? '').trim() || 'Group',
      inviteLink,
    });
  }

  joinable.sort((a, b) => a.groupName.localeCompare(b.groupName));
  return { joinable, missingWithoutInviteLink };
}
