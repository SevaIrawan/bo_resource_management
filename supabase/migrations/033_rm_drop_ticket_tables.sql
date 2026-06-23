-- Hapus modul Ticketing / Issue (tab & reconcile) — Resource Management
-- Jalankan setelah backup jika masih perlu data ticket history.
-- Lengkap: 034_rm_drop_ticket_workflow_tables.sql (activity_logs + workflows legacy)

DROP TABLE IF EXISTS public.resource_management_ticket_activity_logs CASCADE;
DROP TABLE IF EXISTS public.resource_management_ticket_workflows CASCADE;
DROP TABLE IF EXISTS public.resource_management_ticket_issue_handles CASCADE;
DROP TABLE IF EXISTS public.resource_management_tickets CASCADE;
