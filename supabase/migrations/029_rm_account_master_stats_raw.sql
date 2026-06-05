-- Selaraskan RPC dengan ticket + grid: join group_id raw (trim), X = distinct group_id.

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

  SELECT count(DISTINCT trim(m.group_id))::INT INTO v_total
  FROM public.resource_management_groups_master m
  WHERE m.brand = v_brand
    AND m.platform = v_platform
    AND trim(coalesce(m.group_id, '')) <> '';

  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'brand_master_total', 0,
      'joined_in_master', 0,
      'admin_in_master', 0
    );
  END IF;

  WITH daily_gid AS (
    SELECT DISTINCT ON (trim(d.group_id))
      trim(d.group_id) AS gid,
      d.is_admin
    FROM public.resource_management_group_scrape_daily d
    WHERE d.account_id = p_account_id
      AND trim(coalesce(d.group_id, '')) <> ''
    ORDER BY trim(d.group_id), d.scraped_at DESC NULLS LAST
  ),
  master_gid AS (
    SELECT DISTINCT ON (trim(m.group_id))
      trim(m.group_id) AS gid
    FROM public.resource_management_groups_master m
    WHERE m.brand = v_brand
      AND m.platform = v_platform
      AND trim(coalesce(m.group_id, '')) <> ''
  )
  SELECT
    count(*)::INT,
    count(*) FILTER (WHERE d.is_admin = 'yes')::INT
  INTO v_joined, v_admin
  FROM master_gid m
  INNER JOIN daily_gid d ON d.gid = m.gid;

  RETURN jsonb_build_object(
    'brand_master_total', v_total,
    'joined_in_master', coalesce(v_joined, 0),
    'admin_in_master', coalesce(v_admin, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.rm_account_master_stats IS
  'Metrik master↔daily per akun — join group_id raw (trim), X = distinct master gid. Selaras ticket reconcile.';
