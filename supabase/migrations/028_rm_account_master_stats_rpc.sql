-- Agregasi master ↔ daily per akun (Postgres RPC, tanpa loop di renderer).
-- Join group_id normalisasi saja — cepat untuk brand dengan ribuan grup.

CREATE OR REPLACE FUNCTION public.rm_norm_group_id(gid TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN trim(lower(coalesce(gid, ''))) = '' THEN ''
    WHEN trim(lower(gid)) LIKE '%@g.us' THEN trim(lower(gid))
    WHEN trim(gid) ~* '^\d+(-\d+)?@' THEN trim(lower(gid))
    WHEN trim(gid) ~ '^\d+$' THEN trim(gid) || '@g.us'
    ELSE trim(lower(gid))
  END;
$$;

CREATE OR REPLACE FUNCTION public.rm_invite_code(link TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    (regexp_match(lower(trim(coalesce(link, ''))), '(?:chat\.whatsapp\.com/|joinchat/)([a-z0-9_-]+)'))[1],
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.rm_account_master_stats(
  p_account_id UUID,
  p_brand TEXT,
  p_platform TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand TEXT := trim(coalesce(p_brand, ''));
  v_platform TEXT := trim(coalesce(p_platform, ''));
  v_total INT := 0;
  v_joined INT := 0;
  v_admin INT := 0;
BEGIN
  IF p_account_id IS NULL OR v_brand = '' OR v_platform NOT IN ('whatsapp', 'telegram') THEN
    RETURN jsonb_build_object(
      'brand_master_total', 0,
      'joined_in_master', 0,
      'admin_in_master', 0
    );
  END IF;

  SELECT count(*)::INT INTO v_total
  FROM public.resource_management_groups_master m
  WHERE m.brand = v_brand AND m.platform = v_platform;

  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'brand_master_total', 0,
      'joined_in_master', 0,
      'admin_in_master', 0
    );
  END IF;

  WITH daily_gid AS (
    SELECT DISTINCT ON (public.rm_norm_group_id(d.group_id))
      public.rm_norm_group_id(d.group_id) AS ngid,
      d.is_admin
    FROM public.resource_management_group_scrape_daily d
    WHERE d.account_id = p_account_id
      AND public.rm_norm_group_id(d.group_id) <> ''
    ORDER BY public.rm_norm_group_id(d.group_id), d.scraped_at DESC NULLS LAST
  )
  SELECT
    count(*)::INT,
    count(*) FILTER (WHERE d.is_admin = 'yes')::INT
  INTO v_joined, v_admin
  FROM public.resource_management_groups_master m
  INNER JOIN daily_gid d
    ON d.ngid = public.rm_norm_group_id(m.group_id)
  WHERE m.brand = v_brand
    AND m.platform = v_platform
    AND public.rm_norm_group_id(m.group_id) <> '';

  RETURN jsonb_build_object(
    'brand_master_total', v_total,
    'joined_in_master', coalesce(v_joined, 0),
    'admin_in_master', coalesce(v_admin, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rm_norm_group_id(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rm_invite_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rm_account_master_stats(UUID, TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.rm_account_master_stats IS
  'Hitung X (master brand), joined, admin-in-master untuk satu akun — join group_id normalisasi.';
