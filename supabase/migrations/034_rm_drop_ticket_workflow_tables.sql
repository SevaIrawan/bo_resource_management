-- Sisa tabel Ticketing (workflow legacy) — tidak dipakai app v1.0.23+
-- Jalankan setelah 033_rm_drop_ticket_tables.sql

DROP TABLE IF EXISTS public.resource_management_ticket_activity_logs CASCADE;
DROP TABLE IF EXISTS public.resource_management_ticket_workflows CASCADE;

-- Idempotent: pastikan semua tabel ticket hilang (jika 033 belum sempat di env lain)
DROP TABLE IF EXISTS public.resource_management_ticket_issue_handles CASCADE;
DROP TABLE IF EXISTS public.resource_management_tickets CASCADE;
