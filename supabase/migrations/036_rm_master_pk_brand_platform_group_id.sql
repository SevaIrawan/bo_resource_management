-- PK master = (brand, platform, group_id) — bukan id global dari group_id saja.
-- id kolom = label komposit (brand|platform|group_id) untuk SELECT/UI.
-- Dedupe baris existing sebelum ubah constraint.
-- Berlaku whatsapp + telegram (satu skema).

BEGIN;

-- 1) Fungsi 3-arg (overload dengan 035 2-arg — jangan COMMENT/DROP sebelum RPC diganti)
CREATE OR REPLACE FUNCTION public.rm_build_master_row_id(
  p_brand TEXT,
  p_platform TEXT,
  p_group_id TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(p_brand) || E'\x1e' || trim(p_platform) || E'\x1e' || trim(p_group_id);
$$;

-- 2) RPC pakai 3-arg dulu, baru hapus signature 035 (hindari error 42725 ambiguous)
CREATE OR REPLACE FUNCTION public.rm_commit_account_scrape(
  p_account_id UUID,
  p_brand TEXT,
  p_platform TEXT,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand TEXT := trim(p_brand);
  v_now TIMESTAMPTZ := now();
  v_daily INTEGER := 0;
  v_master INTEGER := 0;
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'account_id required';
  END IF;
  IF v_brand = '' THEN
    RAISE EXCEPTION 'BRAND_REQUIRED';
  END IF;
  IF p_platform NOT IN ('whatsapp', 'telegram') THEN
    RAISE EXCEPTION 'invalid platform';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_brand || E'\x1f' || p_platform));

  DELETE FROM public.resource_management_group_scrape_daily
  WHERE account_id = p_account_id;

  IF p_rows IS NOT NULL AND jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO public.resource_management_group_scrape_daily (
      id,
      account_id,
      group_name,
      group_id,
      invite_link,
      owner_count,
      admin_count,
      member_count,
      is_admin,
      platform,
      scrape_date,
      scraped_at,
      created_at,
      brand,
      acc_name,
      phone_number
    )
    SELECT
      r->>'id',
      p_account_id,
      NULLIF(r->>'group_name', ''),
      r->>'group_id',
      NULLIF(r->>'invite_link', ''),
      COALESCE((r->>'owner_count')::INTEGER, 0),
      COALESCE((r->>'admin_count')::INTEGER, 0),
      COALESCE((r->>'member_count')::INTEGER, 0),
      COALESCE(NULLIF(r->>'is_admin', ''), 'no'),
      r->>'platform',
      COALESCE((r->>'scrape_date')::DATE, CURRENT_DATE),
      COALESCE((r->>'scraped_at')::TIMESTAMPTZ, v_now),
      COALESCE((r->>'created_at')::TIMESTAMPTZ, v_now),
      r->>'brand',
      r->>'acc_name',
      COALESCE(r->>'phone_number', '')
    FROM jsonb_array_elements(p_rows) AS r;

    GET DIAGNOSTICS v_daily = ROW_COUNT;
  END IF;

  DELETE FROM public.resource_management_groups_master
  WHERE brand = v_brand AND platform = p_platform;

  WITH daily_all AS (
    SELECT
      trim(d.group_id) AS group_id,
      trim(d.group_name) AS group_name,
      d.invite_link,
      d.is_admin,
      d.scraped_at,
      coalesce(d.owner_count, 0) AS owner_count,
      coalesce(d.admin_count, 0) AS admin_count,
      coalesce(d.member_count, 0) AS member_count
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
      invite_link,
      owner_count,
      admin_count,
      member_count
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
    last_sync,
    owner_count,
    admin_count,
    member_count
  )
  SELECT
    public.rm_build_master_row_id(v_brand, p_platform, group_id),
    group_id,
    group_name,
    invite_link,
    v_brand,
    p_platform,
    v_now,
    owner_count,
    admin_count,
    member_count
  FROM picked;

  GET DIAGNOSTICS v_master = ROW_COUNT;

  RETURN jsonb_build_object(
    'daily_count', v_daily,
    'master_inserted', v_master,
    'brand', v_brand,
    'platform', p_platform,
    'last_sync', v_now
  );
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

  PERFORM pg_advisory_xact_lock(hashtext(v_brand || E'\x1f' || p_platform));

  DELETE FROM public.resource_management_groups_master
  WHERE brand = v_brand AND platform = p_platform;

  WITH daily_all AS (
    SELECT
      trim(d.group_id) AS group_id,
      trim(d.group_name) AS group_name,
      d.invite_link,
      d.is_admin,
      d.scraped_at,
      coalesce(d.owner_count, 0) AS owner_count,
      coalesce(d.admin_count, 0) AS admin_count,
      coalesce(d.member_count, 0) AS member_count
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
      invite_link,
      owner_count,
      admin_count,
      member_count
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
    last_sync,
    owner_count,
    admin_count,
    member_count
  )
  SELECT
    public.rm_build_master_row_id(v_brand, p_platform, group_id),
    group_id,
    group_name,
    invite_link,
    v_brand,
    p_platform,
    v_now,
    owner_count,
    admin_count,
    member_count
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

DROP FUNCTION IF EXISTS public.rm_build_master_row_id(TEXT, TEXT);

COMMENT ON FUNCTION public.rm_build_master_row_id(TEXT, TEXT, TEXT) IS
  'Label baris master (bukan PK). PK tabel = (brand, platform, group_id).';

-- 3) Bersihkan data master sebelum ubah PK
UPDATE public.resource_management_groups_master
SET group_id = trim(group_id)
WHERE group_id IS NOT NULL AND group_id <> trim(group_id);

DELETE FROM public.resource_management_groups_master m
WHERE m.ctid NOT IN (
  SELECT DISTINCT ON (brand, platform, trim(group_id))
    ctid
  FROM public.resource_management_groups_master
  ORDER BY
    brand,
    platform,
    trim(group_id),
    last_sync DESC NULLS LAST
);

UPDATE public.resource_management_groups_master m
SET id = public.rm_build_master_row_id(m.brand, m.platform, m.group_id);

-- 4) PK = (brand, platform, group_id)
ALTER TABLE public.resource_management_groups_master
  DROP CONSTRAINT IF EXISTS resource_management_groups_master_pkey;

ALTER TABLE public.resource_management_groups_master
  DROP CONSTRAINT IF EXISTS rm_groups_master_brand_plat_gid;

ALTER TABLE public.resource_management_groups_master
  ADD PRIMARY KEY (brand, platform, group_id);

COMMENT ON COLUMN public.resource_management_groups_master.id IS
  'Label komposit brand+platform+group_id (bukan PK). PK = (brand, platform, group_id).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_rm_groups_master_id_label
  ON public.resource_management_groups_master (id);

GRANT EXECUTE ON FUNCTION public.rm_commit_account_scrape(UUID, TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rm_rebuild_brand_groups_master(TEXT, TEXT) TO anon, authenticated;

COMMIT;
