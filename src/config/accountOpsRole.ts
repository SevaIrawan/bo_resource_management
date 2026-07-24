/** Role operasi akun — Master boleh Create Group (+ semua job); GCS selain Create. */
export type AccountOpsRole = 'gcs' | 'master';

export const ACCOUNT_OPS_ROLE_OPTIONS: AccountOpsRole[] = ['gcs', 'master'];

/** Max grup Create Group per akun per execute (anti-bot). */
export const CREATE_GROUP_MAX_PER_ACCOUNT_RUN = 25;

export function normalizeAccountOpsRole(value: unknown): AccountOpsRole | null {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (
    raw === 'gcs' ||
    raw === 'main' ||
    raw === 'main_acc' ||
    raw === 'basic'
  ) {
    return 'gcs';
  }
  if (raw === 'master' || raw === 'creator') return 'master';
  return null;
}

/** Legacy tanpa role → GCS (bukan Master). */
export function effectiveAccountOpsRole(value: unknown): AccountOpsRole {
  return normalizeAccountOpsRole(value) ?? 'gcs';
}

/** Master = boleh Create Group (+ job queue lain). */
export function isMasterOpsRole(value: unknown): boolean {
  return effectiveAccountOpsRole(value) === 'master';
}

/** @deprecated alias — pakai isMasterOpsRole */
export function isCreatorOpsRole(value: unknown): boolean {
  return isMasterOpsRole(value);
}

export function readOpsRoleFromMetadata(metadata: unknown): AccountOpsRole | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const row = metadata as { ops_role?: unknown; opsRole?: unknown };
  return normalizeAccountOpsRole(row.ops_role ?? row.opsRole);
}
