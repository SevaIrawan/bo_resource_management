-- =============================================================================
-- 030: groups_master — owner/admin/member counts dari daily picked (post-scrape)
-- member_non_admin = member_count - owner_count - admin_count (generated)
-- RPC rm_rebuild_brand_groups_master: logika picked/delete/insert sama + counts
-- =============================================================================

ALTER TABLE public.resource_management_groups_master
  ADD COLUMN IF NOT EXISTS owner_count INTEGER NOT NULL DEFAULT 0 CHECK (owner_count >= 0),
  ADD COLUMN IF NOT EXISTS admin_count INTEGER NOT NULL DEFAULT 0 CHECK (admin_count >= 0),
  ADD COLUMN IF NOT EXISTS member_count INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0);

ALTER TABLE public.resource_management_groups_master
  ADD COLUMN IF NOT EXISTS member_non_admin INTEGER GENERATED ALWAYS AS (
    member_count - owner_count - admin_count
  ) STORED;

COMMENT ON COLUMN public.resource_management_groups_master.owner_count IS
  'Super-admin count dari baris daily picked (scrape valid terbaru).';
COMMENT ON COLUMN public.resource_management_groups_master.admin_count IS
  'Admin count (bukan owner) dari baris daily picked (scrape valid terbaru).';
COMMENT ON COLUMN public.resource_management_groups_master.member_count IS
  'Total participant dari baris daily picked (scrape valid terbaru).';
COMMENT ON COLUMN public.resource_management_groups_master.member_non_admin IS
  'member_count - owner_count - admin_count; generated, bukan input manual.';

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
    public.rm_build_master_row_id(group_id, group_name),
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

COMMENT ON FUNCTION public.rm_rebuild_brand_groups_master IS
  'Konsolidasi daily → master (dedupe group_id, link valid, counts dari baris picked). Panggil setelah scrape per akun.';

GRANT EXECUTE ON FUNCTION public.rm_rebuild_brand_groups_master(TEXT, TEXT) TO anon, authenticated;
