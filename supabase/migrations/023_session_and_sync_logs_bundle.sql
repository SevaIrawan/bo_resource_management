-- Migrasi log session + sync activity (satu-satunya file untuk fitur ini).
-- Butuh 017 (atau 018) sudah jalan. Setelah 020.
-- Aman di-run ulang (idempotent).

DROP FUNCTION IF EXISTS public.rm_append_session_status_log(UUID, TEXT, TEXT, TEXT);

ALTER TABLE public.resource_management_platform_session_logs
  ADD COLUMN IF NOT EXISTS session_status TEXT;

ALTER TABLE public.resource_management_platform_session_logs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.resource_management_platform_session_logs
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE public.resource_management_platform_session_logs
  DROP CONSTRAINT IF EXISTS resource_management_platform_session_logs_event_type_check;

ALTER TABLE public.resource_management_platform_session_logs
  ADD CONSTRAINT resource_management_platform_session_logs_event_type_check
  CHECK (event_type IN (
    'connect', 'disconnect', 'login_qr', 'login_phone',
    'login_success', 'login_failed', 'session_restored', 'session_expired',
    'probe_failed', 'device_logout', 'db_invalidated', 'sync_valid', 'session_replaced'
  ));

ALTER TABLE public.resource_management_platform_session_logs
  DROP CONSTRAINT IF EXISTS resource_management_platform_session_logs_session_status_check;

ALTER TABLE public.resource_management_platform_session_logs
  ADD CONSTRAINT resource_management_platform_session_logs_session_status_check
  CHECK (session_status IS NULL OR session_status IN ('valid', 'logout', 'invalid', 'replaced'));

CREATE INDEX IF NOT EXISTS idx_rm_platform_session_logs_account_created
  ON public.resource_management_platform_session_logs(account_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.rm_log_session_activity(
  p_account_id UUID,
  p_platform_session_id UUID,
  p_platform TEXT,
  p_session_status TEXT,
  p_event_type TEXT,
  p_message TEXT DEFAULT NULL,
  p_login_method TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  v_platform TEXT;
BEGIN
  IF p_platform IS NULL OR p_platform = '' THEN
    SELECT ma.platform::TEXT INTO v_platform
    FROM public.resource_management_messaging_accounts ma
    WHERE ma.id = p_account_id;
  ELSE
    v_platform := p_platform;
  END IF;

  INSERT INTO public.resource_management_platform_session_logs (
    account_id, platform_session_id, platform, session_status, event_type,
    login_method, message, metadata, updated_at
  )
  VALUES (
    p_account_id, p_platform_session_id, COALESCE(v_platform, 'whatsapp'),
    p_session_status, p_event_type, p_login_method,
    COALESCE(p_message, p_session_status),
    jsonb_build_object('recorded_at', NOW(), 'session_status', p_session_status),
    NOW()
  )
  RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rm_deactivate_platform_sessions(
  p_account_id UUID,
  p_reason TEXT DEFAULT 'revoked'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_status TEXT;
  v_event TEXT;
BEGIN
  v_status := CASE
    WHEN p_reason ILIKE '%logout%' OR p_reason ILIKE '%disconnect%' OR p_reason = 'device_logout' THEN 'logout'
    WHEN p_reason = 'replaced' THEN 'replaced'
    ELSE 'invalid'
  END;
  v_event := CASE
    WHEN v_status = 'logout' THEN 'device_logout'
    WHEN v_status = 'replaced' THEN 'session_replaced'
    ELSE 'db_invalidated'
  END;

  FOR r IN
    SELECT ps.id, ps.login_method, ma.platform::TEXT AS platform
    FROM public.resource_management_platform_sessions ps
    JOIN public.resource_management_messaging_accounts ma ON ma.id = ps.account_id
    WHERE ps.account_id = p_account_id AND ps.is_active = true
  LOOP
    PERFORM public.rm_log_session_activity(
      p_account_id, r.id, r.platform, v_status, v_event,
      COALESCE(p_reason, v_status), r.login_method
    );
  END LOOP;

  UPDATE public.resource_management_platform_sessions
  SET
    is_active = false,
    disconnected_at = NOW(),
    disconnect_reason = COALESCE(p_reason, 'revoked'),
    updated_at = NOW()
  WHERE account_id = p_account_id AND is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.rm_save_platform_session(
  p_account_id UUID,
  p_session_data TEXT,
  p_session_type TEXT DEFAULT 'telethon_string',
  p_login_method TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_platform TEXT;
BEGIN
  SELECT platform::TEXT INTO v_platform
  FROM public.resource_management_messaging_accounts
  WHERE id = p_account_id;

  PERFORM public.rm_deactivate_platform_sessions(p_account_id, 'replaced');

  INSERT INTO public.resource_management_platform_sessions (
    account_id, session_data, session_type, login_method,
    is_active, connected_at, disconnected_at, disconnect_reason, last_sync_at
  )
  VALUES (
    p_account_id, p_session_data, p_session_type, p_login_method,
    true, NOW(), NULL, NULL, NOW()
  )
  RETURNING id INTO v_id;

  PERFORM public.rm_log_session_activity(
    p_account_id, v_id, v_platform, 'valid', 'login_success',
    'Session connected (saved to database)', p_login_method
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rm_log_session_activity(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rm_deactivate_platform_sessions(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rm_save_platform_session(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.resource_management_sync_activity_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  sync_source     TEXT NOT NULL CHECK (sync_source IN ('auto', 'manual')),
  session_status  TEXT CHECK (session_status IN ('valid', 'logout', 'invalid')),
  device_groups   INT NOT NULL DEFAULT 0,
  brand_groups    INT NOT NULL DEFAULT 0,
  admin_groups    INT NOT NULL DEFAULT 0,
  message         TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rm_sync_activity_account_created
  ON public.resource_management_sync_activity_logs(account_id, created_at DESC);

ALTER TABLE public.resource_management_sync_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rm_sync_activity_anon_select ON public.resource_management_sync_activity_logs;
CREATE POLICY rm_sync_activity_anon_select
  ON public.resource_management_sync_activity_logs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS rm_sync_activity_anon_insert ON public.resource_management_sync_activity_logs;
CREATE POLICY rm_sync_activity_anon_insert
  ON public.resource_management_sync_activity_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS rm_sync_activity_anon_update ON public.resource_management_sync_activity_logs;
CREATE POLICY rm_sync_activity_anon_update
  ON public.resource_management_sync_activity_logs FOR UPDATE TO anon, authenticated USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'resource_management_platform_session_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.resource_management_platform_session_logs;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'resource_management_sync_activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.resource_management_sync_activity_logs;
  END IF;
END $$;
