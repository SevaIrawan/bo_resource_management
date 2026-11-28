-- 045 — percepat sync label saat hapus akun / rebuild master.
-- Jalankan sekali di SQL editor. Jangan jalankan ulang 043 atau 044.
-- Penyebab timeout: rm_sync_group_batch_labels memindai daily sekali per grup.
-- Sekarang daily brand dibaca satu kali, lalu batas waktu fungsi dinaikkan.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_rm_group_scrape_daily_brand_platform_group
  ON public.resource_management_group_scrape_daily (brand, platform, group_id);
CREATE OR REPLACE FUNCTION public.rm_sync_group_batch_labels(
  p_brand TEXT,
  p_platform TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '180s'
AS $fn$
DECLARE
  c_cap CONSTANT INTEGER := 400;
  v_brand TEXT := trim(p_brand);
  v_now TIMESTAMPTZ := now();
  v_reactivated INTEGER := 0;
  v_missing INTEGER := 0;
  v_closed INTEGER := 0;
  v_assigned INTEGER := 0;
  v_idx INTEGER;
  v_used INTEGER[] := array_fill(0, ARRAY[702]);
  v_pick INTEGER;
  r RECORD;
  rec RECORD;
BEGIN
  IF p_platform IS DISTINCT FROM 'whatsapp' THEN
    RETURN jsonb_build_object('skipped', 'platform_not_whatsapp');
  END IF;
  IF v_brand = '' THEN
    RAISE EXCEPTION 'BRAND_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_brand || E'\x1f' || p_platform));

  UPDATE public.resource_management_group_batch_labels l
  SET status = 'active',
      missing_since = NULL,
      updated_at = v_now
  WHERE l.brand = v_brand
    AND l.platform = p_platform
    AND l.status = 'missing'
    AND EXISTS (
      SELECT 1 FROM public.resource_management_groups_master m
      WHERE m.brand = v_brand AND m.platform = p_platform AND m.group_id = l.group_id
    );
  GET DIAGNOSTICS v_reactivated = ROW_COUNT;

  DROP TABLE IF EXISTS pg_temp.rm_sync_holders;
  CREATE TEMP TABLE rm_sync_holders ON COMMIT DROP AS
  SELECT trim(d.group_id) AS group_id,
         array_agg(DISTINCT d.account_id ORDER BY d.account_id) AS holders
  FROM public.resource_management_group_scrape_daily d
  WHERE d.brand = v_brand
    AND d.platform = p_platform
    AND length(trim(d.group_id)) > 0
  GROUP BY trim(d.group_id);

  UPDATE public.resource_management_group_batch_labels l
  SET holder_account_ids = COALESCE(h.holders, '{}'::uuid[]),
      updated_at = v_now
  FROM (
    SELECT l2.group_id, agg.holders
    FROM public.resource_management_group_batch_labels l2
    LEFT JOIN rm_sync_holders agg ON agg.group_id = l2.group_id
    WHERE l2.brand = v_brand
      AND l2.platform = p_platform
      AND l2.status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.resource_management_groups_master m
        WHERE m.brand = v_brand AND m.platform = p_platform AND m.group_id = l2.group_id
      )
  ) h
  WHERE l.brand = v_brand
    AND l.platform = p_platform
    AND l.group_id = h.group_id;

  UPDATE public.resource_management_group_batch_labels l
  SET status = 'missing',
      missing_since = v_now,
      updated_at = v_now
  WHERE l.brand = v_brand
    AND l.platform = p_platform
    AND l.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.resource_management_groups_master m
      WHERE m.brand = v_brand AND m.platform = p_platform AND m.group_id = l.group_id
    );
  GET DIAGNOSTICS v_missing = ROW_COUNT;

  UPDATE public.resource_management_group_batch_labels l
  SET status = 'closed',
      closed_at = v_now,
      close_reason = CASE
        WHEN EXISTS (
          SELECT 1
          FROM unnest(l.holder_account_ids) AS hid(id)
          JOIN public.resource_management_group_exit_records e
            ON e.account_id = hid.id
           AND e.brand = l.brand
           AND e.platform = l.platform
           AND e.group_id = l.group_id
           AND e.action = 'delete'
        ) THEN 'delete'
        WHEN EXISTS (
          SELECT 1
          FROM unnest(l.holder_account_ids) AS hid(id)
          JOIN public.resource_management_group_exit_records e
            ON e.account_id = hid.id
           AND e.brand = l.brand
           AND e.platform = l.platform
           AND e.group_id = l.group_id
           AND e.action = 'leave'
        ) THEN 'leave'
        ELSE 'account_deleted'
      END,
      updated_at = v_now
  WHERE l.brand = v_brand
    AND l.platform = p_platform
    AND l.status = 'missing'
    AND cardinality(l.holder_account_ids) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(l.holder_account_ids) AS hid(id)
      WHERE EXISTS (
        SELECT 1 FROM public.resource_management_messaging_accounts a WHERE a.id = hid.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.resource_management_group_exit_records e
        WHERE e.account_id = hid.id
          AND e.brand = l.brand
          AND e.platform = l.platform
          AND e.group_id = l.group_id
          AND e.action IN ('leave', 'delete')
      )
    );
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  FOR rec IN
    SELECT public.rm_batch_index(l.batch) AS idx, count(*)::INTEGER AS used
    FROM public.resource_management_group_batch_labels l
    WHERE l.brand = v_brand
      AND l.platform = p_platform
      AND l.status IN ('active', 'missing')
    GROUP BY l.batch
  LOOP
    IF rec.idx BETWEEN 0 AND 701 THEN
      v_used[rec.idx + 1] := rec.used;
    END IF;
  END LOOP;

  FOR r IN
    SELECT m.group_id, m.group_created_at
    FROM public.resource_management_groups_master m
    WHERE m.brand = v_brand
      AND m.platform = p_platform
      AND NOT EXISTS (
        SELECT 1 FROM public.resource_management_group_batch_labels l
        WHERE l.brand = v_brand AND l.platform = p_platform AND l.group_id = m.group_id
      )
    ORDER BY m.group_id
  LOOP
    v_idx := NULL;
    FOR v_pick IN 1..702 LOOP
      IF v_used[v_pick] < c_cap THEN
        v_idx := v_pick - 1;
        EXIT;
      END IF;
    END LOOP;
    IF v_idx IS NULL THEN
      RAISE EXCEPTION 'batch capacity exhausted for brand %', v_brand;
    END IF;

    INSERT INTO public.resource_management_group_batch_labels (
      brand, platform, group_id, batch, status, group_created_at,
      assigned_at, missing_since, updated_at, holder_account_ids
    )
    VALUES (
      v_brand,
      p_platform,
      r.group_id,
      public.rm_batch_letter(v_idx),
      'active',
      r.group_created_at,
      v_now,
      NULL,
      v_now,
      COALESCE(
        (SELECT h.holders FROM rm_sync_holders h WHERE h.group_id = r.group_id),
        '{}'::uuid[]
      )
    );

    v_used[v_idx + 1] := v_used[v_idx + 1] + 1;
    v_assigned := v_assigned + 1;
  END LOOP;

  UPDATE public.resource_management_groups_master m
  SET batch = l.batch
  FROM public.resource_management_group_batch_labels l
  WHERE m.brand = v_brand
    AND m.platform = p_platform
    AND l.brand = m.brand
    AND l.platform = m.platform
    AND l.group_id = m.group_id
    AND l.status = 'active';

  UPDATE public.resource_management_groups_master m
  SET batch = NULL
  WHERE m.brand = v_brand
    AND m.platform = p_platform
    AND NOT EXISTS (
      SELECT 1 FROM public.resource_management_group_batch_labels l
      WHERE l.brand = m.brand
        AND l.platform = m.platform
        AND l.group_id = m.group_id
        AND l.status = 'active'
    );

  RETURN jsonb_build_object(
    'brand', v_brand,
    'state', 'synced',
    'reactivated', v_reactivated,
    'missing', v_missing,
    'closed', v_closed,
    'assigned', v_assigned
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.rm_sync_group_batch_labels(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.rm_commit_account_scrape(UUID, TEXT, TEXT, JSONB)
  SET statement_timeout = '180s';

ALTER FUNCTION public.rm_rebuild_brand_groups_master(TEXT, TEXT)
  SET statement_timeout = '180s';

COMMIT;