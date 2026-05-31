-- =============================================================================
-- UPGRADE (tanpa full reset) — jalankan SEKALI di Supabase SQL Editor
-- Untuk DB yang pernah pakai migrasi lama (001–011, 019, brand_standard_groups).
-- Instal baru: cukup 003 + 017 (jangan jalankan file ini).
-- =============================================================================

-- Trigger + RPC pipeline lama (019)
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

-- Tabel referensi lama (bukan sumber master lagi)
DROP TABLE IF EXISTS public.resource_management_brand_standard_groups CASCADE;

-- Master per account_id → master per brand+platform (sama seperti 017 bagian master)
DROP TABLE IF EXISTS public.resource_management_groups_master CASCADE;

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

ALTER TABLE public.resource_management_groups_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rm_groups_master_anon_select ON public.resource_management_groups_master;
DROP POLICY IF EXISTS rm_groups_master_anon_insert ON public.resource_management_groups_master;
DROP POLICY IF EXISTS rm_groups_master_anon_update ON public.resource_management_groups_master;
DROP POLICY IF EXISTS rm_groups_master_anon_delete ON public.resource_management_groups_master;

CREATE POLICY rm_groups_master_anon_select ON public.resource_management_groups_master
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rm_groups_master_anon_insert ON public.resource_management_groups_master
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY rm_groups_master_anon_update ON public.resource_management_groups_master
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY rm_groups_master_anon_delete ON public.resource_management_groups_master
  FOR DELETE TO anon, authenticated USING (true);

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
    id, group_id, group_name, invite_link, brand, platform, last_sync
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

GRANT EXECUTE ON FUNCTION public.rm_rebuild_brand_groups_master(TEXT, TEXT) TO anon, authenticated;

ALTER TABLE public.resource_management_tickets
  DROP CONSTRAINT IF EXISTS resource_management_tickets_ticket_type_check;

ALTER TABLE public.resource_management_tickets
  ADD CONSTRAINT resource_management_tickets_ticket_type_check
  CHECK (ticket_type IN (
    'missing_group',
    'not_admin',
    'group_count_mismatch',
    'duplicate_group_id',
    'duplicate_group_name',
    'daily_junk_group'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'resource_management_groups_master'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.resource_management_groups_master;
  END IF;
END $$;
