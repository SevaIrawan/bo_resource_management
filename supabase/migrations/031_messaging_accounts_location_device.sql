-- =============================================================================
-- 031: messaging_accounts — kolom location_device (device / worker location)
-- Backfill dari metadata->>'location_device' untuk data lama.
-- =============================================================================

ALTER TABLE public.resource_management_messaging_accounts
  ADD COLUMN IF NOT EXISTS location_device TEXT;

COMMENT ON COLUMN public.resource_management_messaging_accounts.location_device IS
  'Physical device or worker location label for this account (e.g. PC-01, Jakarta-Worker-2).';

UPDATE public.resource_management_messaging_accounts
SET location_device = NULLIF(trim(metadata->>'location_device'), '')
WHERE location_device IS NULL
  AND NULLIF(trim(metadata->>'location_device'), '') IS NOT NULL;
