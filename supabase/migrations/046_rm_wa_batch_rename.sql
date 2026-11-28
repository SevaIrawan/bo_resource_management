-- 046 — nama batch boleh diganti per brand.
-- Jalankan sekali di SQL editor. Jangan jalankan ulang 043, 044, atau 045.
-- A/B/C tidak terkunci. Save di Setting mengganti label, master, dan akun New Acc brand itu.

BEGIN;

CREATE OR REPLACE FUNCTION public.rm_wa_batch_token_ok(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_value IS NOT NULL
    AND length(btrim(p_value)) BETWEEN 1 AND 32
    AND btrim(p_value) !~* '^old$'
    AND btrim(p_value) ~ '^[A-Za-z0-9]([A-Za-z0-9 _-]{0,31})$';
$$;

ALTER TABLE public.resource_management_group_batch_labels
  DROP CONSTRAINT IF EXISTS rm_group_batch_labels_batch_check;

ALTER TABLE public.resource_management_group_batch_labels
  ADD CONSTRAINT rm_group_batch_labels_batch_check
  CHECK (public.rm_wa_batch_token_ok(batch));

ALTER TABLE public.resource_management_messaging_accounts
  DROP CONSTRAINT IF EXISTS rm_messaging_accounts_wa_batch_check;

ALTER TABLE public.resource_management_messaging_accounts
  ADD CONSTRAINT rm_messaging_accounts_wa_batch_check
  CHECK (
    wa_batch IS NULL
    OR (platform = 'whatsapp' AND (public.rm_wa_batch_token_ok(wa_batch) OR wa_batch = 'OLD'))
  );

ALTER TABLE public.resource_management_groups_master
  DROP CONSTRAINT IF EXISTS rm_groups_master_batch_check;

ALTER TABLE public.resource_management_groups_master
  ADD CONSTRAINT rm_groups_master_batch_check
  CHECK (
    batch IS NULL
    OR (platform = 'whatsapp' AND public.rm_wa_batch_token_ok(batch))
  );

CREATE OR REPLACE FUNCTION public.rm_rename_brand_wa_batches(
  p_brand TEXT,
  p_pairs JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_brand TEXT := btrim(p_brand);
  v_from TEXT;
  v_to TEXT;
  v_temp TEXT;
  v_pair JSONB;
  v_i INTEGER := 0;
  v_labels INTEGER := 0;
  v_master INTEGER := 0;
  v_accounts INTEGER := 0;
  v_count INTEGER := 0;
  v_step INTEGER;
  v_sources TEXT[] := '{}';
  v_targets TEXT[] := '{}';
  v_temps TEXT[] := '{}';
BEGIN
  IF v_brand = '' THEN
    RAISE EXCEPTION 'BRAND_REQUIRED';
  END IF;
  IF p_pairs IS NULL OR jsonb_typeof(p_pairs) IS DISTINCT FROM 'array' OR jsonb_array_length(p_pairs) = 0 THEN
    RAISE EXCEPTION 'PAIRS_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_brand || E'\x1f' || 'whatsapp'));

  FOR v_pair IN SELECT value FROM jsonb_array_elements(p_pairs)
  LOOP
    v_from := btrim(v_pair->>'from');
    v_to := regexp_replace(btrim(v_pair->>'to'), '\s+', ' ', 'g');
    IF NOT public.rm_wa_batch_token_ok(v_from) OR NOT public.rm_wa_batch_token_ok(v_to) THEN
      RAISE EXCEPTION 'INVALID_TOKEN';
    END IF;
    IF v_from = v_to THEN
      CONTINUE;
    END IF;
    IF v_to = ANY (v_targets) OR v_from = ANY (v_sources) THEN
      RAISE EXCEPTION 'BATCH_DUPLICATE';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.resource_management_group_batch_labels l
      WHERE l.brand = v_brand
        AND l.platform = 'whatsapp'
        AND l.batch = v_from
    ) THEN
      RAISE EXCEPTION 'BATCH_NOT_FOUND';
    END IF;
    v_sources := v_sources || v_from;
    v_targets := v_targets || v_to;
    v_temps := v_temps || ('z' || substr(md5(v_brand || E'\x1f' || v_from || E'\x1f' || v_i::text), 1, 20));
    v_i := v_i + 1;
  END LOOP;

  IF v_i = 0 THEN
    RETURN jsonb_build_object('renamed', 0, 'labels', 0, 'master', 0, 'accounts', 0);
  END IF;

  FOR v_step IN 1..v_i LOOP
    v_to := v_targets[v_step];
    IF EXISTS (
      SELECT 1
      FROM public.resource_management_group_batch_labels l
      WHERE l.brand = v_brand
        AND l.platform = 'whatsapp'
        AND l.batch = v_to
        AND NOT (l.batch = ANY (v_sources))
    ) THEN
      RAISE EXCEPTION 'BATCH_TARGET_EXISTS';
    END IF;
  END LOOP;

  FOR v_step IN 1..v_i LOOP
    v_from := v_sources[v_step];
    v_temp := v_temps[v_step];

    UPDATE public.resource_management_group_batch_labels
    SET batch = v_temp, updated_at = now()
    WHERE brand = v_brand AND platform = 'whatsapp' AND batch = v_from;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_labels := v_labels + v_count;

    UPDATE public.resource_management_groups_master
    SET batch = v_temp
    WHERE brand = v_brand AND platform = 'whatsapp' AND batch = v_from;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_master := v_master + v_count;

    UPDATE public.resource_management_messaging_accounts a
    SET wa_batch = v_temp, updated_at = now()
    FROM public.resource_management_brands b
    WHERE a.brand_id = b.id
      AND b.name = v_brand
      AND a.platform = 'whatsapp'
      AND a.wa_batch = v_from;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_accounts := v_accounts + v_count;
  END LOOP;

  FOR v_step IN 1..v_i LOOP
    v_temp := v_temps[v_step];
    v_to := v_targets[v_step];

    UPDATE public.resource_management_group_batch_labels
    SET batch = v_to
    WHERE brand = v_brand AND platform = 'whatsapp' AND batch = v_temp;

    UPDATE public.resource_management_groups_master
    SET batch = v_to
    WHERE brand = v_brand AND platform = 'whatsapp' AND batch = v_temp;

    UPDATE public.resource_management_messaging_accounts a
    SET wa_batch = v_to
    FROM public.resource_management_brands b
    WHERE a.brand_id = b.id
      AND b.name = v_brand
      AND a.platform = 'whatsapp'
      AND a.wa_batch = v_temp;
  END LOOP;

  RETURN jsonb_build_object(
    'renamed', v_i,
    'labels', v_labels,
    'master', v_master,
    'accounts', v_accounts
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.rm_rename_brand_wa_batches(TEXT, JSONB) TO anon, authenticated;

COMMIT;
