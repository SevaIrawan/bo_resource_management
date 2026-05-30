-- =============================================================================
-- Resource Management — Database Schema
-- =============================================================================
-- PREFIX: resource_management_*  (semua table project ini)
--
-- JALANKAN di Supabase SQL Editor
-- ASUMSI: public.users(id) SUDAH ADA — tidak dibuat di migration ini
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. resource_management_user_sessions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_management_user_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_token   TEXT NOT NULL UNIQUE,
  platform        TEXT NOT NULL DEFAULT 'desktop'
    CHECK (platform IN ('desktop', 'web')),
  device_info     JSONB NOT NULL DEFAULT '{}',
  ip_address      INET,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  end_reason      TEXT CHECK (end_reason IN ('logout', 'expired', 'revoked', 'replaced', 'forced')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rm_user_sessions_active_check CHECK (
    (is_active = true AND ended_at IS NULL)
    OR (is_active = false AND ended_at IS NOT NULL)
    OR (is_active = false AND end_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_rm_user_sessions_user_id
  ON public.resource_management_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_rm_user_sessions_active
  ON public.resource_management_user_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_rm_user_sessions_token
  ON public.resource_management_user_sessions(session_token);

COMMENT ON TABLE public.resource_management_user_sessions IS '[RM] Session aktif dashboard';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. resource_management_session_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_management_session_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  session_id      UUID REFERENCES public.resource_management_user_sessions(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL
    CHECK (event_type IN ('login', 'logout', 'refresh', 'expired', 'failed', 'revoked')),
  platform        TEXT NOT NULL DEFAULT 'desktop',
  device_info     JSONB NOT NULL DEFAULT '{}',
  ip_address      INET,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rm_session_logs_user_id
  ON public.resource_management_session_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_rm_session_logs_created
  ON public.resource_management_session_logs(created_at DESC);

COMMENT ON TABLE public.resource_management_session_logs IS '[RM] Audit login/logout dashboard';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. resource_management_messaging_accounts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_management_messaging_accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  label             TEXT NOT NULL,
  phone_or_username TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  notes             TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rm_messaging_accounts_label_unique
    UNIQUE (user_id, platform, label)
);

CREATE INDEX IF NOT EXISTS idx_rm_messaging_accounts_user
  ON public.resource_management_messaging_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_rm_messaging_accounts_platform
  ON public.resource_management_messaging_accounts(platform);

COMMENT ON TABLE public.resource_management_messaging_accounts IS '[RM] Registry akun WA/TG';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. resource_management_platform_sessions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_management_platform_sessions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  session_data        TEXT NOT NULL,
  session_type        TEXT NOT NULL
    CHECK (session_type IN ('whatsapp_local_auth', 'telethon_string', 'telethon_sqlite')),
  login_method        TEXT CHECK (login_method IN ('qr', 'phone')),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  connected_at        TIMESTAMPTZ,
  disconnected_at     TIMESTAMPTZ,
  disconnect_reason   TEXT CHECK (disconnect_reason IN (
    'logout', 'expired', 'revoked', 'replaced', 'error', 'banned'
  )),
  last_sync_at        TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rm_platform_sessions_account
  ON public.resource_management_platform_sessions(account_id);

COMMENT ON TABLE public.resource_management_platform_sessions IS '[RM] Session WA/TG di DB';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. resource_management_platform_session_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_management_platform_session_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  platform_session_id UUID REFERENCES public.resource_management_platform_sessions(id) ON DELETE SET NULL,
  platform            TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  event_type          TEXT NOT NULL
    CHECK (event_type IN (
      'connect', 'disconnect', 'login_qr', 'login_phone',
      'login_success', 'login_failed', 'session_restored', 'session_expired'
    )),
  login_method        TEXT CHECK (login_method IN ('qr', 'phone')),
  message             TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rm_platform_session_logs_account
  ON public.resource_management_platform_session_logs(account_id);

COMMENT ON TABLE public.resource_management_platform_session_logs IS '[RM] Audit connect/disconnect WA/TG';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. resource_management_scrape_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_management_scrape_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  trigger_type    TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (trigger_type IN ('scheduled', 'manual')),
  status          TEXT NOT NULL
    CHECK (status IN ('started', 'running', 'completed', 'failed', 'partial')),
  groups_total    INTEGER NOT NULL DEFAULT 0 CHECK (groups_total >= 0),
  groups_success  INTEGER NOT NULL DEFAULT 0 CHECK (groups_success >= 0),
  groups_failed   INTEGER NOT NULL DEFAULT 0 CHECK (groups_failed >= 0),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_rm_scrape_logs_account
  ON public.resource_management_scrape_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_rm_scrape_logs_started
  ON public.resource_management_scrape_logs(started_at DESC);

COMMENT ON TABLE public.resource_management_scrape_logs IS '[RM] Log job scraper';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. resource_management_group_scrape_daily  (RAW / history harian)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_management_group_scrape_daily (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scrape_log_id       UUID REFERENCES public.resource_management_scrape_logs(id) ON DELETE SET NULL,
  account_id          UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  brand               TEXT NOT NULL,
  acc_name            TEXT NOT NULL,
  scrape_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  group_name          TEXT,
  group_id            TEXT NOT NULL,
  group_link          TEXT,
  is_admin            BOOLEAN NOT NULL DEFAULT false,
  count_owner         INTEGER NOT NULL DEFAULT 0 CHECK (count_owner >= 0),
  count_admin         INTEGER NOT NULL DEFAULT 0 CHECK (count_admin >= 0),
  count_member        INTEGER NOT NULL DEFAULT 0 CHECK (count_member >= 0),
  count_participant   INTEGER NOT NULL DEFAULT 0 CHECK (count_participant >= 0),
  group_status        TEXT NOT NULL DEFAULT 'active'
    CHECK (group_status IN ('active', 'left', 'banned', 'broken', 'empty', 'error')),
  error_message       TEXT,
  is_archived         BOOLEAN NOT NULL DEFAULT false,
  is_readonly         BOOLEAN NOT NULL DEFAULT false,
  scraped_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rm_group_scrape_daily_account
  ON public.resource_management_group_scrape_daily(account_id);
CREATE INDEX IF NOT EXISTS idx_rm_group_scrape_daily_brand
  ON public.resource_management_group_scrape_daily(brand);
CREATE INDEX IF NOT EXISTS idx_rm_group_scrape_daily_brand_acc
  ON public.resource_management_group_scrape_daily(brand, acc_name);
CREATE INDEX IF NOT EXISTS idx_rm_group_scrape_daily_date
  ON public.resource_management_group_scrape_daily(scrape_date DESC);
CREATE INDEX IF NOT EXISTS idx_rm_group_scrape_daily_status
  ON public.resource_management_group_scrape_daily(group_status);

COMMENT ON TABLE public.resource_management_group_scrape_daily IS '[RM] Hasil scraper harian — raw, semua status';
COMMENT ON COLUMN public.resource_management_group_scrape_daily.brand IS 'Brand pemilik akun — pemisah multi-brand';
COMMENT ON COLUMN public.resource_management_group_scrape_daily.acc_name IS 'Nama akun WA/TG yang dipakai saat scrape';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. resource_management_groups_master  (CLEAN / source of truth)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_management_groups_master (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  brand               TEXT NOT NULL,
  acc_name            TEXT NOT NULL,
  group_name          TEXT NOT NULL,
  group_id            TEXT NOT NULL,
  group_link          TEXT,
  is_admin            BOOLEAN NOT NULL DEFAULT false,
  count_owner         INTEGER NOT NULL DEFAULT 0 CHECK (count_owner >= 0),
  count_admin         INTEGER NOT NULL DEFAULT 0 CHECK (count_admin >= 0),
  count_member        INTEGER NOT NULL DEFAULT 0 CHECK (count_member >= 0),
  count_participant   INTEGER NOT NULL DEFAULT 0 CHECK (count_participant >= 0),
  is_archived         BOOLEAN NOT NULL DEFAULT false,
  is_readonly         BOOLEAN NOT NULL DEFAULT false,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_daily_id       UUID REFERENCES public.resource_management_group_scrape_daily(id) ON DELETE SET NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rm_groups_master_unique_group
    UNIQUE (account_id, platform, group_id)
);

CREATE INDEX IF NOT EXISTS idx_rm_groups_master_account
  ON public.resource_management_groups_master(account_id);
CREATE INDEX IF NOT EXISTS idx_rm_groups_master_brand
  ON public.resource_management_groups_master(brand);
CREATE INDEX IF NOT EXISTS idx_rm_groups_master_brand_acc
  ON public.resource_management_groups_master(brand, acc_name);
CREATE INDEX IF NOT EXISTS idx_rm_groups_master_active
  ON public.resource_management_groups_master(is_active) WHERE is_active = true;

COMMENT ON TABLE public.resource_management_groups_master IS '[RM] Master group bersih — source of truth';
COMMENT ON COLUMN public.resource_management_groups_master.brand IS 'Brand pemilik akun — pemisah multi-brand';
COMMENT ON COLUMN public.resource_management_groups_master.acc_name IS 'Nama akun WA/TG yang dipakai';

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resource_management_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rm_messaging_accounts_updated_at ON public.resource_management_messaging_accounts;
CREATE TRIGGER rm_messaging_accounts_updated_at
  BEFORE UPDATE ON public.resource_management_messaging_accounts
  FOR EACH ROW EXECUTE FUNCTION public.resource_management_set_updated_at();

DROP TRIGGER IF EXISTS rm_platform_sessions_updated_at ON public.resource_management_platform_sessions;
CREATE TRIGGER rm_platform_sessions_updated_at
  BEFORE UPDATE ON public.resource_management_platform_sessions
  FOR EACH ROW EXECUTE FUNCTION public.resource_management_set_updated_at();

DROP TRIGGER IF EXISTS rm_groups_master_updated_at ON public.resource_management_groups_master;
CREATE TRIGGER rm_groups_master_updated_at
  BEFORE UPDATE ON public.resource_management_groups_master
  FOR EACH ROW EXECUTE FUNCTION public.resource_management_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.resource_management_user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_messaging_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_platform_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_platform_session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_scrape_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_group_scrape_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_management_groups_master ENABLE ROW LEVEL SECURITY;
