-- 044 — Aturan label batch WhatsApp (mengganti isi sync 043, signature RPC tidak berubah)
-- Belum dijalankan ke produksi. Jalankan di SQL Editor hanya atas perintah eksplisit, satu script utuh.
--
-- Dibaca read-only dari produksi 2026-11-28, sebelum file ini ditulis (bukan asumsi planning 21 Nov):
--   tabel label ada, 0 baris, kolom released_at ada, holder_account_ids / closed_at belum ada;
--   messaging_accounts.wa_batch ada, wa_batch_locked belum ada;
--   groups_master.group_created_at ada, kolom batch belum ada;
--   akun WA 56 = OLD 54 + NULL 2, FULL 0, huruf 0; Telegram 45 seluruhnya wa_batch NULL;
--   master WA 3648 grup. Syarat di bawah memakai aturan, bukan angka itu.
--
-- Akun WA yang sudah ada saat script ini jalan dikunci (wa_batch_locked = true) tanpa mengubah
-- nilai wa_batch. NULL tetap NULL. Mereka tidak ikut pengecekan New Acc pada scrape berikutnya.
--
-- Alasan close bila beberapa pemegang selesai bersamaan: delete bila ada catatan delete,
-- selain itu leave bila ada catatan leave, selain itu account_deleted.

BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.resource_management_group_batch_labels') IS NULL
     OR to_regclass('public.resource_management_account_scrape_commits') IS NULL THEN
    RAISE EXCEPTION '044 stopped: tabel 043 belum ada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'resource_management_groups_master'
      AND column_name = 'group_created_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'resource_management_messaging_accounts'
      AND column_name = 'wa_batch'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'resource_management_group_batch_labels'
      AND column_name = 'released_at'
  ) THEN
    RAISE EXCEPTION '044 stopped: bentuk 043 tidak lengkap';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'resource_management_group_batch_labels'
      AND column_name = 'closed_at'
  ) THEN
    RAISE EXCEPTION '044 stopped: kolom closed_at sudah ada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.resource_management_group_batch_labels) THEN
    RAISE EXCEPTION '044 stopped: tabel label tidak kosong';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.resource_management_messaging_accounts
    WHERE platform = 'whatsapp'
      AND wa_batch IS NOT NULL
      AND wa_batch IS DISTINCT FROM 'OLD'
  ) THEN
    RAISE EXCEPTION '044 stopped: ada wa_batch WA selain OLD atau NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.resource_management_messaging_accounts
    WHERE platform IS DISTINCT FROM 'whatsapp'
      AND wa_batch IS NOT NULL
  ) THEN
    RAISE EXCEPTION '044 stopped: akun non-WhatsApp punya wa_batch';
  END IF;
END;
$pre$;

ALTER TABLE public.resource_management_group_batch_labels
  ADD COLUMN holder_account_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN close_reason TEXT,
  ADD COLUMN closed_at TIMESTAMPTZ;

ALTER TABLE public.resource_management_group_batch_labels
  DROP COLUMN released_at;

DO $drop_checks$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'resource_management_group_batch_labels'
      AND c.contype = 'c'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.resource_management_group_batch_labels DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END;
$drop_checks$;

ALTER TABLE public.resource_management_group_batch_labels
  ADD CONSTRAINT rm_group_batch_labels_platform_check CHECK (platform = 'whatsapp'),
  ADD CONSTRAINT rm_group_batch_labels_batch_check CHECK (batch ~ '^[A-Z]{1,2}$'),
  ADD CONSTRAINT rm_group_batch_labels_status_check CHECK (status IN ('active', 'missing', 'closed')),
  ADD CONSTRAINT rm_group_batch_labels_missing_check CHECK (status <> 'missing' OR missing_since IS NOT NULL),
  ADD CONSTRAINT rm_group_batch_labels_closed_check CHECK (
    (status = 'closed' AND closed_at IS NOT NULL AND close_reason IN ('account_deleted', 'leave', 'delete'))
    OR (status <> 'closed' AND closed_at IS NULL AND close_reason IS NULL)
  );

COMMENT ON COLUMN public.resource_management_group_batch_labels.holder_account_ids IS
  'Akun yang daily-nya memuat grup ini saat status masih active. Dibekukan saat menjadi missing.';
COMMENT ON COLUMN public.resource_management_group_batch_labels.assigned_at IS
  'Waktu grup pertama kali masuk tabel label. Tidak diubah saat pindah status atau saat slot diisi ulang.';
COMMENT ON COLUMN public.resource_management_group_batch_labels.close_reason IS
  'Terisi hanya saat status closed. delete bila ada catatan delete; jika tidak, leave bila ada catatan leave; jika tidak, account_deleted.';

ALTER TABLE public.resource_management_messaging_accounts
  ADD COLUMN wa_batch_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.resource_management_messaging_accounts.wa_batch_locked IS
  'true = batch akun tidak dihitung ulang. Akun yang sudah ada saat 044 dikunci true. NULL wa_batch pada akun terkunci diperlakukan sebagai akun lama.';

DO $wa_check$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = ANY (c.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'resource_management_messaging_accounts'
      AND c.contype = 'c'
      AND a.attname = 'wa_batch'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.resource_management_messaging_accounts DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END;
$wa_check$;

ALTER TABLE public.resource_management_messaging_accounts
  ADD CONSTRAINT rm_messaging_accounts_wa_batch_check
  CHECK (
    wa_batch IS NULL
    OR (platform = 'whatsapp' AND (wa_batch ~ '^[A-Z]{1,2}$' OR wa_batch = 'OLD'))
  );

UPDATE public.resource_management_messaging_accounts
SET wa_batch_locked = true
WHERE platform = 'whatsapp';

ALTER TABLE public.resource_management_groups_master
  ADD COLUMN batch TEXT;

ALTER TABLE public.resource_management_groups_master
  DROP CONSTRAINT IF EXISTS rm_groups_master_batch_check;

ALTER TABLE public.resource_management_groups_master
  ADD CONSTRAINT rm_groups_master_batch_check
  CHECK (
    batch IS NULL
    OR (platform = 'whatsapp' AND batch ~ '^[A-Z]{1,2}$')
  );

COMMENT ON COLUMN public.resource_management_groups_master.batch IS
  'Huruf batch dari tabel label saat status label active. Kosong untuk Telegram dan untuk grup WA tanpa label active.';

CREATE TABLE public.resource_management_group_exit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  brand TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform = 'whatsapp'),
  group_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('leave', 'delete')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rm_group_exit_records_unique UNIQUE (account_id, brand, platform, group_id, action)
);

CREATE INDEX rm_group_exit_records_group_idx
  ON public.resource_management_group_exit_records (brand, platform, group_id);

CREATE INDEX IF NOT EXISTS idx_rm_group_scrape_daily_brand_platform_group
  ON public.resource_management_group_scrape_daily (brand, platform, group_id);

ALTER TABLE public.resource_management_group_exit_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY rm_group_exit_records_select
  ON public.resource_management_group_exit_records
  FOR SELECT TO anon, authenticated
  USING (true);

COMMENT ON TABLE public.resource_management_group_exit_records IS
  'Catatan Leave/Delete sukses per akun. Tidak ikut terhapus bila akun dihapus. Penulisan hanya lewat rm_record_group_exit.';

-- Klasifikasi New Acc. Dipanggil hanya dari rm_commit_account_scrape.
CREATE OR REPLACE FUNCTION public.rm_classify_wa_account_batch(
  p_account_id UUID,
  p_brand TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_brand TEXT := trim(p_brand);
  v_platform TEXT;
  v_batch TEXT;
  v_locked BOOLEAN;
  v_master INTEGER := 0;
  v_labeled INTEGER := 0;
  v_distinct INTEGER := 0;
  v_one TEXT;
BEGIN
  SELECT a.platform, a.wa_batch, a.wa_batch_locked
  INTO v_platform, v_batch, v_locked
  FROM public.resource_management_messaging_accounts a
  WHERE a.id = p_account_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'account_missing');
  END IF;
  IF v_platform IS DISTINCT FROM 'whatsapp' THEN
    RETURN jsonb_build_object('state', 'skipped_platform');
  END IF;

  IF v_locked IS TRUE
     OR v_batch IS NULL
     OR v_batch = 'OLD'
     OR v_batch !~ '^[A-Z]{1,2}$' THEN
    IF v_locked IS NOT TRUE AND (v_batch IS NULL OR v_batch = 'OLD') THEN
      UPDATE public.resource_management_messaging_accounts
      SET wa_batch = 'OLD',
          wa_batch_locked = true
      WHERE id = p_account_id;
      RETURN jsonb_build_object('state', 'locked_old', 'wa_batch', 'OLD');
    END IF;
    RETURN jsonb_build_object('state', 'unchanged', 'wa_batch', v_batch, 'locked', v_locked);
  END IF;

  SELECT count(*) INTO v_master
  FROM (
    SELECT DISTINCT trim(d.group_id) AS group_id
    FROM public.resource_management_group_scrape_daily d
    JOIN public.resource_management_groups_master m
      ON m.brand = v_brand
     AND m.platform = 'whatsapp'
     AND m.group_id = trim(d.group_id)
    WHERE d.account_id = p_account_id
      AND d.brand = v_brand
      AND d.platform = 'whatsapp'
      AND length(trim(d.group_id)) > 0
  ) g;

  IF v_master = 0 THEN
    UPDATE public.resource_management_messaging_accounts
    SET wa_batch_locked = true
    WHERE id = p_account_id;
    RETURN jsonb_build_object('state', 'kept_choice', 'wa_batch', v_batch, 'master_groups', 0);
  END IF;

  SELECT count(*) INTO v_labeled
  FROM (
    SELECT DISTINCT trim(d.group_id) AS group_id
    FROM public.resource_management_group_scrape_daily d
    JOIN public.resource_management_groups_master m
      ON m.brand = v_brand
     AND m.platform = 'whatsapp'
     AND m.group_id = trim(d.group_id)
    JOIN public.resource_management_group_batch_labels l
      ON l.brand = v_brand
     AND l.platform = 'whatsapp'
     AND l.group_id = trim(d.group_id)
     AND l.status IN ('active', 'missing')
    WHERE d.account_id = p_account_id
      AND d.brand = v_brand
      AND d.platform = 'whatsapp'
      AND length(trim(d.group_id)) > 0
  ) g;

  IF v_labeled < v_master THEN
    RETURN jsonb_build_object(
      'state', 'labels_incomplete',
      'wa_batch', v_batch,
      'master_groups', v_master,
      'labeled', v_labeled
    );
  END IF;

  SELECT count(DISTINCT l.batch), min(l.batch)
  INTO v_distinct, v_one
  FROM public.resource_management_group_batch_labels l
  WHERE l.brand = v_brand
    AND l.platform = 'whatsapp'
    AND l.status IN ('active', 'missing')
    AND l.group_id IN (
      SELECT DISTINCT trim(d.group_id)
      FROM public.resource_management_group_scrape_daily d
      JOIN public.resource_management_groups_master m
        ON m.brand = v_brand
       AND m.platform = 'whatsapp'
       AND m.group_id = trim(d.group_id)
      WHERE d.account_id = p_account_id
        AND d.brand = v_brand
        AND d.platform = 'whatsapp'
        AND length(trim(d.group_id)) > 0
    );

  IF v_distinct = 1 THEN
    UPDATE public.resource_management_messaging_accounts
    SET wa_batch = v_one,
        wa_batch_locked = true
    WHERE id = p_account_id;
    RETURN jsonb_build_object('state', 'followed_groups', 'wa_batch', v_one, 'master_groups', v_master);
  END IF;

  UPDATE public.resource_management_messaging_accounts
  SET wa_batch = 'OLD',
      wa_batch_locked = true
  WHERE id = p_account_id;
  RETURN jsonb_build_object('state', 'became_old', 'wa_batch', 'OLD', 'batches', v_distinct);
END;
$fn$;

REVOKE ALL ON FUNCTION public.rm_classify_wa_account_batch(UUID, TEXT) FROM PUBLIC, anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.rm_record_group_exit(
  p_account_id UUID,
  p_brand TEXT,
  p_group_id TEXT,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_brand TEXT := trim(p_brand);
  v_group_id TEXT := trim(p_group_id);
  v_action TEXT := lower(trim(p_action));
  v_account_brand TEXT;
  v_platform TEXT;
  v_inserted INTEGER := 0;
  v_sync JSONB := NULL;
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'account_id required';
  END IF;
  IF v_brand = '' OR v_group_id = '' THEN
    RAISE EXCEPTION 'BRAND_AND_GROUP_REQUIRED';
  END IF;
  IF v_action NOT IN ('leave', 'delete') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;

  SELECT b.name, a.platform
  INTO v_account_brand, v_platform
  FROM public.resource_management_messaging_accounts a
  JOIN public.resource_management_brands b ON b.id = a.brand_id
  WHERE a.id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found';
  END IF;
  IF v_platform IS DISTINCT FROM 'whatsapp' THEN
    RAISE EXCEPTION 'platform_not_whatsapp';
  END IF;
  IF v_account_brand IS DISTINCT FROM v_brand THEN
    RAISE EXCEPTION 'BRAND_MISMATCH';
  END IF;

  INSERT INTO public.resource_management_group_exit_records (
    account_id, brand, platform, group_id, action
  )
  VALUES (p_account_id, v_brand, 'whatsapp', v_group_id, v_action)
  ON CONFLICT (account_id, brand, platform, group_id, action) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  BEGIN
    v_sync := public.rm_sync_group_batch_labels(v_brand, 'whatsapp');
  EXCEPTION WHEN OTHERS THEN
    v_sync := jsonb_build_object('error', left(SQLERRM, 300));
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'batch_sync', v_sync
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.rm_record_group_exit(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;


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
SET statement_timeout = '180s'
AS $$
DECLARE
  v_brand TEXT := trim(p_brand);
  v_now TIMESTAMPTZ := now();
  v_daily INTEGER := 0;
  v_master INTEGER := 0;
  v_batch JSONB := NULL;
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
      is_owner,
      platform,
      scrape_date,
      scraped_at,
      created_at,
      brand,
      acc_name,
      phone_number,
      group_created_at
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
      CASE
        WHEN lower(trim(COALESCE(NULLIF(r->>'is_owner', ''), 'no'))) = 'yes' THEN 'yes'
        ELSE COALESCE(NULLIF(r->>'is_admin', ''), 'no')
      END,
      COALESCE(NULLIF(r->>'is_owner', ''), 'no'),
      r->>'platform',
      COALESCE((r->>'scrape_date')::DATE, CURRENT_DATE),
      COALESCE((r->>'scraped_at')::TIMESTAMPTZ, v_now),
      COALESCE((r->>'created_at')::TIMESTAMPTZ, v_now),
      r->>'brand',
      r->>'acc_name',
      COALESCE(r->>'phone_number', ''),
      NULLIF(r->>'group_created_at', '')::TIMESTAMPTZ
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
      coalesce(d.member_count, 0) AS member_count,
      d.group_created_at
    FROM public.resource_management_group_scrape_daily d
    WHERE d.brand = v_brand
      AND d.platform = p_platform
      AND length(trim(d.group_id)) > 0
      AND length(trim(coalesce(d.group_name, ''))) > 0
  ),
  eligible AS (
    SELECT group_id
    FROM daily_all
    GROUP BY group_id
    HAVING
      bool_or(lower(trim(coalesce(is_admin, ''))) = 'yes')
      AND bool_or(public.rm_invite_link_is_valid(p_platform, invite_link))
  ),
  invite_picked AS (
    SELECT DISTINCT ON (d.group_id)
      d.group_id,
      d.invite_link,
      d.scraped_at
    FROM daily_all d
    INNER JOIN eligible e ON e.group_id = d.group_id
    WHERE public.rm_invite_link_is_valid(p_platform, d.invite_link)
    ORDER BY
      d.group_id,
      d.scraped_at DESC
  ),
  meta_picked AS (
    SELECT DISTINCT ON (d.group_id)
      d.group_id,
      d.group_name,
      d.owner_count,
      d.admin_count,
      d.member_count
    FROM daily_all d
    INNER JOIN eligible e ON e.group_id = d.group_id
    ORDER BY
      d.group_id,
      CASE WHEN lower(trim(coalesce(d.is_admin, ''))) = 'yes' THEN 0 ELSE 1 END,
      d.scraped_at DESC
  ),
  created_picked AS (
    SELECT d.group_id, min(d.group_created_at) AS group_created_at
    FROM daily_all d
    INNER JOIN eligible e ON e.group_id = d.group_id
    GROUP BY d.group_id
  ),
  picked AS (
    SELECT
      m.group_id,
      m.group_name,
      i.invite_link,
      m.owner_count,
      m.admin_count,
      m.member_count,
      c.group_created_at
    FROM meta_picked m
    INNER JOIN invite_picked i ON i.group_id = m.group_id
    LEFT JOIN created_picked c ON c.group_id = m.group_id
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
    member_count,
    group_created_at
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
    member_count,
    group_created_at
  FROM picked;

  GET DIAGNOSTICS v_master = ROW_COUNT;

  -- Waktu commit (jam server). Bukan aturan tutup slot; slot ditutup dari pemegang + catatan keluar.
  INSERT INTO public.resource_management_account_scrape_commits (account_id, brand, platform, committed_at)
  VALUES (p_account_id, v_brand, p_platform, v_now)
  ON CONFLICT (account_id) DO UPDATE
    SET brand = EXCLUDED.brand, platform = EXCLUDED.platform, committed_at = EXCLUDED.committed_at;

  -- Sync label batch (WA). Gagal sync TIDAK boleh menggagalkan commit scrape.
  -- Sync label (WA) lalu klasifikasi New Acc. Gagal keduanya TIDAK membatalkan commit scrape.
  -- Klasifikasi yang gagal tidak mengunci wa_batch_locked (blok dalam sendiri).
  IF p_platform = 'whatsapp' THEN
    BEGIN
      v_batch := public.rm_sync_group_batch_labels(v_brand, p_platform);
      BEGIN
        v_batch := COALESCE(v_batch, '{}'::jsonb) || jsonb_build_object(
          'account_batch',
          public.rm_classify_wa_account_batch(p_account_id, v_brand)
        );
      EXCEPTION WHEN OTHERS THEN
        v_batch := COALESCE(v_batch, '{}'::jsonb) || jsonb_build_object(
          'account_batch_error', left(SQLERRM, 300)
        );
      END;
    EXCEPTION WHEN OTHERS THEN
      v_batch := jsonb_build_object('error', left(SQLERRM, 300));
    END;

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
  END IF;

  RETURN jsonb_build_object(
    'daily_count', v_daily,
    'master_inserted', v_master,
    'brand', v_brand,
    'platform', p_platform,
    'last_sync', v_now,
    'batch_sync', v_batch
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
SET statement_timeout = '180s'
AS $$
DECLARE
  v_brand TEXT := trim(p_brand);
  v_now TIMESTAMPTZ := now();
  v_inserted INTEGER;
  v_batch JSONB := NULL;
BEGIN
  IF v_brand = '' THEN
    RAISE EXCEPTION 'BRAND_REQUIRED';
  END IF;
  IF p_platform NOT IN ('whatsapp', 'telegram') THEN
    RAISE EXCEPTION 'invalid platform';
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
      coalesce(d.member_count, 0) AS member_count,
      d.group_created_at
    FROM public.resource_management_group_scrape_daily d
    WHERE d.brand = v_brand
      AND d.platform = p_platform
      AND length(trim(d.group_id)) > 0
      AND length(trim(coalesce(d.group_name, ''))) > 0
  ),
  eligible AS (
    SELECT group_id
    FROM daily_all
    GROUP BY group_id
    HAVING
      bool_or(lower(trim(coalesce(is_admin, ''))) = 'yes')
      AND bool_or(public.rm_invite_link_is_valid(p_platform, invite_link))
  ),
  invite_picked AS (
    SELECT DISTINCT ON (d.group_id)
      d.group_id,
      d.invite_link,
      d.scraped_at
    FROM daily_all d
    INNER JOIN eligible e ON e.group_id = d.group_id
    WHERE public.rm_invite_link_is_valid(p_platform, d.invite_link)
    ORDER BY
      d.group_id,
      d.scraped_at DESC
  ),
  meta_picked AS (
    SELECT DISTINCT ON (d.group_id)
      d.group_id,
      d.group_name,
      d.owner_count,
      d.admin_count,
      d.member_count
    FROM daily_all d
    INNER JOIN eligible e ON e.group_id = d.group_id
    ORDER BY
      d.group_id,
      CASE WHEN lower(trim(coalesce(d.is_admin, ''))) = 'yes' THEN 0 ELSE 1 END,
      d.scraped_at DESC
  ),
  created_picked AS (
    SELECT d.group_id, min(d.group_created_at) AS group_created_at
    FROM daily_all d
    INNER JOIN eligible e ON e.group_id = d.group_id
    GROUP BY d.group_id
  ),
  picked AS (
    SELECT
      m.group_id,
      m.group_name,
      i.invite_link,
      m.owner_count,
      m.admin_count,
      m.member_count,
      c.group_created_at
    FROM meta_picked m
    INNER JOIN invite_picked i ON i.group_id = m.group_id
    LEFT JOIN created_picked c ON c.group_id = m.group_id
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
    member_count,
    group_created_at
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
    member_count,
    group_created_at
  FROM picked;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF p_platform = 'whatsapp' THEN
    BEGIN
      v_batch := public.rm_sync_group_batch_labels(v_brand, p_platform);
    EXCEPTION WHEN OTHERS THEN
      v_batch := jsonb_build_object('error', left(SQLERRM, 300));
    END;

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
  END IF;

  RETURN jsonb_build_object(
    'brand', v_brand,
    'platform', p_platform,
    'master_inserted', v_inserted,
    'last_sync', v_now,
    'batch_sync', v_batch
  );
END;
$$;


COMMENT ON FUNCTION public.rm_commit_account_scrape(UUID, TEXT, TEXT, JSONB) IS
  'Atomik: replace daily akun + rebuild master brand+platform (WA+TG, gate 040) + catat waktu commit + sync label batch WA (044) + klasifikasi New Acc. Gagal sync/klasifikasi tidak membatalkan commit.';

COMMENT ON FUNCTION public.rm_rebuild_brand_groups_master(TEXT, TEXT) IS
  'Rebuild master dari daily brand+platform (WA+TG, gate 040). Untuk WhatsApp ikut memanggil sync label 044.';

DO $backfill$
DECLARE
  r record;
  v_result JSONB;
BEGIN
  FOR r IN
    SELECT DISTINCT m.brand
    FROM public.resource_management_groups_master m
    WHERE m.platform = 'whatsapp'
    ORDER BY m.brand
  LOOP
    v_result := public.rm_sync_group_batch_labels(r.brand, 'whatsapp');
    IF v_result ? 'error' OR COALESCE(v_result->>'state', '') IS DISTINCT FROM 'synced' THEN
      RAISE EXCEPTION '044 backfill failed for brand %: %', r.brand, v_result;
    END IF;
  END LOOP;
END;
$backfill$;

GRANT EXECUTE ON FUNCTION public.rm_commit_account_scrape(UUID, TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rm_rebuild_brand_groups_master(TEXT, TEXT) TO anon, authenticated;

COMMIT;
