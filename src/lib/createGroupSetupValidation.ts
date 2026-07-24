import { CREATE_GROUP_MAX_PER_ACCOUNT_RUN } from '@/config/accountOpsRole';

export type CreateGroupSetupValidationInput = {
  groupName: string;
  totalToCreateRaw: string;
  useGroupNumbering: boolean;
  startFromRaw: string;
  hasSelectedAccount: boolean;
  maxPerRun?: number;
};

export type CreateGroupSetupValidationCode =
  | 'createGroupNameRequired'
  | 'createTotalInvalid'
  | 'createStartFromRequired'
  | 'createSelectAccountRequired';

export function resolveCreateGroupMaxPerRun(maxPerRun?: number): number {
  const n = Math.floor(Number(maxPerRun) || CREATE_GROUP_MAX_PER_ACCOUNT_RUN);
  if (!Number.isFinite(n) || n < 1) return CREATE_GROUP_MAX_PER_ACCOUNT_RUN;
  return Math.min(CREATE_GROUP_MAX_PER_ACCOUNT_RUN, n);
}

export function collectCreateGroupSetupValidationCodes(
  input: CreateGroupSetupValidationInput,
): CreateGroupSetupValidationCode[] {
  const codes: CreateGroupSetupValidationCode[] = [];
  const maxPerRun = resolveCreateGroupMaxPerRun(input.maxPerRun);

  if (!input.groupName.trim()) {
    codes.push('createGroupNameRequired');
  }

  const total = Number(input.totalToCreateRaw);
  if (
    !input.totalToCreateRaw.trim() ||
    !Number.isFinite(total) ||
    total < 1 ||
    total > maxPerRun
  ) {
    codes.push('createTotalInvalid');
  }

  if (input.useGroupNumbering) {
    const start = Number(input.startFromRaw);
    if (!input.startFromRaw.trim() || !Number.isFinite(start) || start < 1) {
      codes.push('createStartFromRequired');
    }
  }

  if (!input.hasSelectedAccount) {
    codes.push('createSelectAccountRequired');
  }

  return codes;
}
