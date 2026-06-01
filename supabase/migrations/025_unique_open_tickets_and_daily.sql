-- Satu open ticket per akun + jenis + group_id (wajib tidak duplikat di DB).
CREATE UNIQUE INDEX IF NOT EXISTS idx_rm_tickets_open_account_type_gid
  ON public.resource_management_tickets (account_id, ticket_type, group_id)
  WHERE status = 'open' AND group_id IS NOT NULL AND btrim(group_id) <> '';

-- Satu open count-mismatch per akun (tanpa group_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_rm_tickets_open_count_mismatch
  ON public.resource_management_tickets (account_id)
  WHERE status = 'open' AND ticket_type = 'group_count_mismatch';
