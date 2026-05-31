import { assertRmSchema, RM_SCHEMA_HINT } from '@/lib/assertRmSchema';

export const PHONE_COLUMN_MIGRATION_HINT = RM_SCHEMA_HINT;

/** @deprecated Gunakan assertRmSchema — tetap dipanggil dari modul lama. */
export async function assertPhoneColumnsInDb(): Promise<void> {
  await assertRmSchema();
}

