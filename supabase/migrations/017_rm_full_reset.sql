-- =============================================================================
-- Resource Management — FULL SCHEMA (Desktop-ready, Supabase realtime)
-- =============================================================================
-- Jalankan SETELAH 003_auth_login_rpc.sql
-- PERINGATAN: DROP semua resource_management_* + data hilang
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Drop RPC / trigger legacy (019 pipeline — jangan dibiarkan di DB) ────────
DROP TRIGGER IF EXISTS trg_rm_daily_upsert_master ON public.resource_management_group_scrape_daily;
DROP FUNCTION IF EXISTS public.rm_daily_row_is_clean(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rm_clean_daily_and_sync_master(UUID);
DROP FUNCTION IF EXISTS public.rm_upsert_master_from_daily();
DROP FUNCTION IF EXISTS public.rm_delete_master_from_daily();
DROP FUNCTION IF EXISTS public.rm_daily_matches_brand_standard(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rm_brand_has_standard_groups(UUID);
DROP FUNCTION IF EXISTS public.rm_sync_master_after_scrape(UUID, DATE, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.rm_sync_daily_after_scrape(UUID, DATE, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.rm_finalize_scrape_snapshot(UUID, DATE, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.rm_rebuild_brand_groups_master(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rm_build_master_row_id(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rm_invite_link_is_valid(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rm_save_platform_session(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rm_deactivate_platform_sessions(UUID, TEXT);

-- ── Drop tables (urutan FK) ───────────────────────────────────────────────────
DROP TABLE IF EXISTS public.resource_management_tickets CASCADE;
DROP TABLE IF EXISTS public.resource_management_brand_standard_groups CASCADE;
DROP TABLE IF EXISTS public.resource_management_account_snapshots CASCADE;
DROP TABLE IF EXISTS public.resource_management_scrape_runs CASCADE;
DROP TABLE IF EXISTS public.resource_management_platform_session_logs CASCADE;
DROP TABLE IF EXISTS public.resource_management_session_logs CASCADE;
DROP TABLE IF EXISTS public.resource_management_user_sessions CASCADE;
DROP TABLE IF EXISTS public.resource_management_scrape_logs CASCADE;
DROP TABLE IF EXISTS public.resource_management_platform_sessions CASCADE;
DROP TABLE IF EXISTS public.resource_management_group_scrape_daily CASCADE;
DROP TABLE IF EXISTS public.resource_management_groups_master CASCADE;
DROP TABLE IF EXISTS public.resource_management_messaging_accounts CASCADE;
DROP TABLE IF EXISTS public.resource_management_brands CASCADE;

-- =============================================================================
-- 1. BRANDS
-- =============================================================================
CREATE TABLE public.resource_management_brands (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  standard_group_count  INTEGER NOT NULL DEFAULT 0 CHECK (standard_group_count >= 0),
  empty_slot_count      INTEGER NOT NULL DEFAULT 3 CHECK (empty_slot_count >= 0),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rm_brands_user_name_unique UNIQUE (user_id, name)
);

CREATE INDEX idx_rm_brands_user ON public.resource_management_brands(user_id);

-- =============================================================================
-- 2. MESSAGING ACCOUNTS (WA / TG)
-- =============================================================================
CREATE TABLE public.resource_management_messaging_accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand_id          UUID NOT NULL REFERENCES public.resource_management_brands(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  label             TEXT NOT NULL,
  phone_number      TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  notes             TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rm_messaging_accounts_label_unique UNIQUE (user_id, platform, label)
);

CREATE INDEX idx_rm_messaging_accounts_user ON public.resource_management_messaging_accounts(user_id);
CREATE INDEX idx_rm_messaging_accounts_brand ON public.resource_management_messaging_accounts(brand_id);
CREATE INDEX idx_rm_messaging_accounts_platform ON public.resource_management_messaging_accounts(platform);

-- =============================================================================
-- 3. PLATFORM SESSIONS (realtime ↔ device)
-- =============================================================================
CREATE TABLE public.resource_management_platform_sessions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  session_data        TEXT NOT NULL,
  session_type        TEXT NOT NULL
    CHECK (session_type IN ('whatsapp_local_auth', 'telethon_string', 'telethon_sqlite')),
  login_method        TEXT CHECK (login_method IN ('qr', 'phone')),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  connected_at        TIMESTAMPTZ,
  disconnected_at     TIMESTAMPTZ,
  disconnect_reason   TEXT,
  last_sync_at        TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rm_platform_sessions_account ON public.resource_management_platform_sessions(account_id);
CREATE INDEX idx_rm_platform_sessions_active
  ON public.resource_management_platform_sessions(account_id) WHERE is_active = true;

-- =============================================================================
-- 4. PLATFORM SESSION LOGS (audit)
-- =============================================================================
CREATE TABLE public.resource_management_platform_session_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  platform_session_id UUID REFERENCES public.resource_management_platform_sessions(id) ON DELETE SET NULL,
  platform            TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  event_type          TEXT NOT NULL CHECK (event_type IN (
    'connect', 'disconnect', 'login_qr', 'login_phone',
    'login_success', 'login_failed', 'session_restored', 'session_expired',
    'probe_failed', 'device_logout', 'db_invalidated'
  )),
  login_method        TEXT CHECK (login_method IN ('qr', 'phone')),
  message             TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rm_platform_session_logs_account ON public.resource_management_platform_session_logs(account_id);
CREATE INDEX idx_rm_platform_session_logs_created ON public.resource_management_platform_session_logs(created_at DESC);

-- =============================================================================
-- 5. SCRAPE RUNS (job log per akun)
-- =============================================================================
CREATE TABLE public.resource_management_scrape_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  trigger_type    TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('scheduled', 'manual')),
  status          TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'running', 'completed', 'failed', 'partial')),
  groups_total    INTEGER NOT NULL DEFAULT 0 CHECK (groups_total >= 0),
  groups_success  INTEGER NOT NULL DEFAULT 0 CHECK (groups_success >= 0),
  groups_failed   INTEGER NOT NULL DEFAULT 0 CHECK (groups_failed >= 0),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_rm_scrape_runs_account ON public.resource_management_scrape_runs(account_id);
CREATE INDEX idx_rm_scrape_runs_started ON public.resource_management_scrape_runs(started_at DESC);

-- =============================================================================
-- 6. GROUP SCRAPE DAILY
-- =============================================================================
CREATE TABLE public.resource_management_group_scrape_daily (
  id              TEXT NOT NULL,
  account_id      UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  group_name      TEXT,
  group_id        TEXT NOT NULL,
  invite_link     TEXT,
  owner_count     INTEGER NOT NULL DEFAULT 0 CHECK (owner_count >= 0),
  admin_count     INTEGER NOT NULL DEFAULT 0 CHECK (admin_count >= 0),
  member_count    INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  is_admin        TEXT NOT NULL DEFAULT 'no' CHECK (is_admin IN ('yes', 'no')),
  platform        TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  scrape_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  brand           TEXT NOT NULL,
  acc_name        TEXT NOT NULL,
  phone_number    TEXT NOT NULL,

  PRIMARY KEY (id, scrape_date)
);

CREATE INDEX idx_rm_group_scrape_daily_account ON public.resource_management_group_scrape_daily(account_id);
CREATE INDEX idx_rm_group_scrape_daily_brand_acc ON public.resource_management_group_scrape_daily(brand, acc_name);
CREATE INDEX idx_rm_group_scrape_daily_brand_acc_phone
  ON public.resource_management_group_scrape_daily(brand, acc_name, phone_number);
CREATE INDEX idx_rm_group_scrape_daily_date ON public.resource_management_group_scrape_daily(scrape_date DESC);

COMMENT ON COLUMN public.resource_management_group_scrape_daily.id IS 'group_id-acc_name';

-- =============================================================================
-- 7. GROUPS MASTER (rekap per brand + platform — Join Group List)
-- =============================================================================
CREATE TABLE public.resource_management_groups_master (
  id            TEXT PRIMARY KEY,
  group_id      TEXT NOT NULL,
  group_name    TEXT NOT NULL,
  invite_link   TEXT NOT NULL,
  brand         TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  last_sync     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rm_groups_master_brand_plat_gid UNIQUE (brand, platform, group_id)
);

CREATE INDEX idx_rm_groups_master_brand_plat
  ON public.resource_management_groups_master(brand, platform);

CREATE INDEX idx_rm_groups_master_group_name
  ON public.resource_management_groups_master(brand, platform, lower(trim(group_name)));

COMMENT ON TABLE public.resource_management_groups_master IS
  'Rekap grup valid per brand+platform. Cek join per akun via daily.group_id.';
COMMENT ON COLUMN public.resource_management_groups_master.id IS 'group_id - group_name';
COMMENT ON COLUMN public.resource_management_groups_master.last_sync IS
  'Waktu rebuild terakhir (UTC di DB; tampil GMT+7 di app).';

-- =============================================================================
-- 8. ACCOUNT SNAPSHOTS (sync metrics — realtime dashboard)
-- =============================================================================
CREATE TABLE public.resource_management_account_snapshots (
  account_id        UUID PRIMARY KEY REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  brand_id          UUID NOT NULL REFERENCES public.resource_management_brands(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  status            TEXT NOT NULL DEFAULT 'logout' CHECK (status IN ('active', 'logout')),
  session_status    TEXT NOT NULL DEFAULT 'invalid' CHECK (session_status IN ('valid', 'invalid')),
  sync_state        TEXT NOT NULL DEFAULT 'pending' CHECK (sync_state IN ('pending', 'synced')),
  groups_current    INTEGER NOT NULL DEFAULT 0 CHECK (groups_current >= 0),
  groups_total      INTEGER NOT NULL DEFAULT 0 CHECK (groups_total >= 0),
  admin_current     INTEGER NOT NULL DEFAULT 0 CHECK (admin_current >= 0),
  admin_total       INTEGER NOT NULL DEFAULT 0 CHECK (admin_total >= 0),
  is_misaligned     BOOLEAN NOT NULL DEFAULT false,
  last_sync_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rm_account_snapshots_brand ON public.resource_management_account_snapshots(brand_id);
CREATE INDEX idx_rm_account_snapshots_misaligned
  ON public.resource_management_account_snapshots(is_misaligned) WHERE is_misaligned = true;

-- =============================================================================
-- 9. TICKETS
-- =============================================================================
CREATE TABLE public.resource_management_tickets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id    UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  brand_id      UUID NOT NULL REFERENCES public.resource_management_brands(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  ticket_type   TEXT NOT NULL CHECK (ticket_type IN (
    'missing_group',
    'not_admin',
    'group_count_mismatch',
    'duplicate_group_id',
    'duplicate_group_name',
    'daily_junk_group'
  )),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  description   TEXT NOT NULL,
  group_link    TEXT,
  group_id      TEXT,
  group_name    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  metadata      JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_rm_tickets_account ON public.resource_management_tickets(account_id);
CREATE INDEX idx_rm_tickets_brand ON public.resource_management_tickets(brand_id);
CREATE INDEX idx_rm_tickets_status ON public.resource_management_tickets(status) WHERE status = 'open';
CREATE INDEX idx_rm_tickets_type ON public.resource_management_tickets(ticket_type);

-- =============================================================================
-- Triggers updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION public.resource_management_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rm_brands_updated_at
  BEFORE UPDATE ON public.resource_management_brands
  FOR EACH ROW EXECUTE FUNCTION public.resource_management_set_updated_at();

CREATE TRIGGER rm_messaging_accounts_updated_at
  BEFORE UPDATE ON public.resource_management_messaging_accounts
  FOR EACH ROW EXECUTE FUNCTION public.resource_management_set_updated_at();

CREATE TRIGGER rm_platform_sessions_updated_at
  BEFORE UPDATE ON public.resource_management_platform_sessions
  FOR EACH ROW EXECUTE FUNCTION public.resource_management_set_updated_at();

-- =============================================================================
-- Row Level Security (app login custom — anon key)
-- =============================================================================
ALTER TABLE public.resource_management_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_messaging_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_platform_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_platform_session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_group_scrape_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_groups_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_account_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_tickets ENABLE ROW LEVEL SECURITY;

-- Helper: policy CRUD anon untuk satu tabel
-- brands
CREATE POLICY rm_brands_anon_select ON public.resource_management_brands FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rm_brands_anon_insert ON public.resource_management_brands FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY rm_brands_anon_update ON public.resource_management_brands FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- messaging_accounts
CREATE POLICY rm_messaging_accounts_anon_select ON public.resource_management_messaging_accounts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rm_messaging_accounts_anon_insert ON public.resource_management_messaging_accounts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY rm_messaging_accounts_anon_update ON public.resource_management_messaging_accounts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- platform_sessions
CREATE POLICY rm_platform_sessions_anon_select ON public.resource_management_platform_sessions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rm_platform_sessions_anon_insert ON public.resource_management_platform_sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY rm_platform_sessions_anon_update ON public.resource_management_platform_sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY rm_platform_sessions_anon_delete ON public.resource_management_platform_sessions FOR DELETE TO anon, authenticated USING (true);

-- platform_session_logs
CREATE POLICY rm_platform_session_logs_anon_select ON public.resource_management_platform_session_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rm_platform_session_logs_anon_insert ON public.resource_management_platform_session_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

-- scrape_runs
CREATE POLICY rm_scrape_runs_anon_select ON public.resource_management_scrape_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rm_scrape_runs_anon_insert ON public.resource_management_scrape_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY rm_scrape_runs_anon_update ON public.resource_management_scrape_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- group_scrape_daily
CREATE POLICY rm_group_scrape_daily_anon_select ON public.resource_management_group_scrape_daily FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rm_group_scrape_daily_anon_insert ON public.resource_management_group_scrape_daily FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY rm_group_scrape_daily_anon_delete ON public.resource_management_group_scrape_daily FOR DELETE TO anon, authenticated USING (true);

-- groups_master
CREATE POLICY rm_groups_master_anon_select ON public.resource_management_groups_master FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rm_groups_master_anon_insert ON public.resource_management_groups_master FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY rm_groups_master_anon_update ON public.resource_management_groups_master FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY rm_groups_master_anon_delete ON public.resource_management_groups_master FOR DELETE TO anon, authenticated USING (true);

-- account_snapshots
CREATE POLICY rm_account_snapshots_anon_select ON public.resource_management_account_snapshots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rm_account_snapshots_anon_insert ON public.resource_management_account_snapshots FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY rm_account_snapshots_anon_update ON public.resource_management_account_snapshots FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- tickets
CREATE POLICY rm_tickets_anon_select ON public.resource_management_tickets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rm_tickets_anon_insert ON public.resource_management_tickets FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY rm_tickets_anon_update ON public.resource_management_tickets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- RPC platform session
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rm_deactivate_platform_sessions(
  p_account_id UUID,
  p_reason TEXT DEFAULT 'revoked'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
BEGIN
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

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rm_deactivate_platform_sessions(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rm_save_platform_session(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- =============================================================================
-- RPC master brand (setelah scrape: client panggil rm_rebuild_brand_groups_master)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rm_build_master_row_id(
  p_group_id TEXT,
  p_group_name TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(p_group_id) || ' - ' || trim(p_group_name);
$$;

CREATE OR REPLACE FUNCTION public.rm_invite_link_is_valid(
  p_platform TEXT,
  p_invite_link TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_link TEXT;
BEGIN
  v_link := trim(coalesce(p_invite_link, ''));
  IF v_link = '' OR v_link = '-' THEN
    RETURN FALSE;
  END IF;
  IF lower(v_link) LIKE '%undefined%' THEN
    RETURN FALSE;
  END IF;

  IF p_platform = 'whatsapp' THEN
    RETURN v_link ~* '^https?://(www\.)?chat\.whatsapp\.com/[a-zA-Z0-9_-]+$';
  END IF;

  IF p_platform = 'telegram' THEN
    RETURN v_link ~* '^https?://(t\.me|telegram\.me)/[a-zA-Z0-9_+/=-]+$';
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.rm_rebuild_brand_groups_master(
  p_brand TEXT,
  p_platform TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand TEXT := trim(p_brand);
  v_now TIMESTAMPTZ := now();
  v_inserted INTEGER;
BEGIN
  IF v_brand = '' THEN
    RAISE EXCEPTION 'BRAND_REQUIRED';
  END IF;

  DELETE FROM public.resource_management_groups_master
  WHERE brand = v_brand AND platform = p_platform;

  WITH daily_all AS (
    SELECT
      d.account_id,
      trim(d.group_id) AS group_id,
      trim(d.group_name) AS group_name,
      d.invite_link,
      d.is_admin,
      d.scraped_at
    FROM public.resource_management_group_scrape_daily d
    WHERE d.brand = v_brand
      AND d.platform = p_platform
      AND length(trim(d.group_id)) > 0
      AND length(trim(coalesce(d.group_name, ''))) > 0
  ),
  valid AS (
    SELECT *
    FROM daily_all
    WHERE public.rm_invite_link_is_valid(p_platform, invite_link)
  ),
  picked AS (
    SELECT DISTINCT ON (group_id)
      group_id,
      group_name,
      invite_link
    FROM valid
    ORDER BY
      group_id,
      CASE WHEN is_admin = 'yes' THEN 0 ELSE 1 END,
      scraped_at DESC
  )
  INSERT INTO public.resource_management_groups_master (
    id,
    group_id,
    group_name,
    invite_link,
    brand,
    platform,
    last_sync
  )
  SELECT
    public.rm_build_master_row_id(group_id, group_name),
    group_id,
    group_name,
    invite_link,
    v_brand,
    p_platform,
    v_now
  FROM picked;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'brand', v_brand,
    'platform', p_platform,
    'master_inserted', v_inserted,
    'last_sync', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.rm_rebuild_brand_groups_master IS
  'Konsolidasi daily → master (dedupe group_id, link valid). Panggil setelah scrape per akun.';

GRANT EXECUTE ON FUNCTION public.rm_rebuild_brand_groups_master(TEXT, TEXT) TO anon, authenticated;

-- =============================================================================
-- Supabase Realtime (desktop multi-window / multi-device)
-- =============================================================================
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'resource_management_platform_sessions',
    'resource_management_account_snapshots',
    'resource_management_scrape_runs',
    'resource_management_tickets',
    'resource_management_messaging_accounts',
    'resource_management_brands',
    'resource_management_groups_master'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
