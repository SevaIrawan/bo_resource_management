-- Penanganan issue per topik (satu baris per issue_id UI)
CREATE TABLE public.resource_management_ticket_issue_handles (
  issue_id     TEXT PRIMARY KEY,
  account_id   UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  brand_name   TEXT NOT NULL,
  platform     TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  ticket_type  TEXT NOT NULL CHECK (ticket_type IN (
    'missing_group',
    'not_admin',
    'group_count_mismatch',
    'duplicate_group_id',
    'duplicate_group_name',
    'daily_junk_group'
  )),
  task_status  TEXT NOT NULL DEFAULT 'todo' CHECK (task_status IN (
    'todo',
    'in_progress',
    'interrupted',
    'complete'
  )),
  start_task   DATE,
  end_task     DATE,
  remark       TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rm_ticket_issue_handles_account
  ON public.resource_management_ticket_issue_handles(account_id);

CREATE INDEX idx_rm_ticket_issue_handles_status
  ON public.resource_management_ticket_issue_handles(task_status);

CREATE TRIGGER trg_rm_ticket_issue_handles_updated_at
  BEFORE UPDATE ON public.resource_management_ticket_issue_handles
  FOR EACH ROW
  EXECUTE FUNCTION public.resource_management_set_updated_at();

ALTER TABLE public.resource_management_ticket_issue_handles ENABLE ROW LEVEL SECURITY;

CREATE POLICY rm_ticket_issue_handles_anon_select
  ON public.resource_management_ticket_issue_handles
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY rm_ticket_issue_handles_anon_insert
  ON public.resource_management_ticket_issue_handles
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY rm_ticket_issue_handles_anon_update
  ON public.resource_management_ticket_issue_handles
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'resource_management_ticket_issue_handles'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.resource_management_ticket_issue_handles;
  END IF;
END $$;
