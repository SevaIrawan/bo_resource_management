-- Hapus tipe ticket group_count_mismatch (diganti oleh missing_group + daily_junk_group per grup).
-- Semua baris lama (open/resolved/dismissed) harus dibersihkan SEBELUM CHECK constraint baru.

UPDATE public.resource_management_tickets
SET status = 'resolved',
    resolved_at = COALESCE(resolved_at, now())
WHERE ticket_type = 'group_count_mismatch'
  AND status = 'open';

DROP INDEX IF EXISTS idx_rm_tickets_open_count_mismatch;

ALTER TABLE public.resource_management_tickets
  DROP CONSTRAINT IF EXISTS resource_management_tickets_ticket_type_check;

ALTER TABLE public.resource_management_ticket_issue_handles
  DROP CONSTRAINT IF EXISTS resource_management_ticket_issue_handles_ticket_type_check;

-- Baris resolved/dismissed masih punya ticket_type lama → hapus agar constraint baru lolos.
DELETE FROM public.resource_management_tickets
WHERE ticket_type = 'group_count_mismatch';

DELETE FROM public.resource_management_ticket_issue_handles
WHERE ticket_type = 'group_count_mismatch';

ALTER TABLE public.resource_management_tickets
  ADD CONSTRAINT resource_management_tickets_ticket_type_check
  CHECK (ticket_type IN (
    'missing_group',
    'not_admin',
    'duplicate_group_id',
    'duplicate_group_name',
    'daily_junk_group'
  ));

ALTER TABLE public.resource_management_ticket_issue_handles
  ADD CONSTRAINT resource_management_ticket_issue_handles_ticket_type_check
  CHECK (ticket_type IN (
    'missing_group',
    'not_admin',
    'duplicate_group_id',
    'duplicate_group_name',
    'daily_junk_group'
  ));
