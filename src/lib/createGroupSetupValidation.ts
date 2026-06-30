export type CreateGroupSetupValidationInput = {
  groupName: string;
  totalToCreateRaw: string;
  useGroupNumbering: boolean;
  startFromRaw: string;
  hasSelectedAccount: boolean;
};

export type CreateGroupSetupValidationCode =
  | 'createGroupNameRequired'
  | 'createTotalInvalid'
  | 'createStartFromRequired'
  | 'createSelectAccountRequired';

export function collectCreateGroupSetupValidationCodes(
  input: CreateGroupSetupValidationInput,
): CreateGroupSetupValidationCode[] {
  const codes: CreateGroupSetupValidationCode[] = [];

  if (!input.groupName.trim()) {
    codes.push('createGroupNameRequired');
  }

  const total = Number(input.totalToCreateRaw);
  if (!input.totalToCreateRaw.trim() || !Number.isFinite(total) || total < 1 || total > 500) {
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
