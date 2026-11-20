-- 043 — Label batch grup WhatsApp per brand
-- SUDAH DIJALANKAN ke Supabase produksi 2026-11-20 lewat SQL Editor dashboard
-- (tidak tercatat di supabase_migrations.schema_migrations). Isi fungsi terverifikasi identik
-- dengan uji lokal (beda hanya akhir baris CRLF). Jangan dijalankan ulang tanpa cek kondisi DB.
--
-- Aturan (disepakati user):
--   1. Label hanya untuk group_id di groups_master WA, kunci (brand, platform, group_id).
--      Label otomatis, tidak bisa diedit dari app (tidak ada policy tulis untuk anon/authenticated).
--   2. Maks 400 grup per batch. Pembagian awal: urut group_created_at (paling lama dulu),
--      seri → group_id. Batch A, B, C … Z, AA, AB …
--   3. Grup baru di master → batch paling awal yang (active + missing) < 400; semua penuh → batch baru.
--   4. Grup hilang dari master → status 'missing' (slot tetap dipegang).
--      'missing' → 'released' bila SEMUA akun WA aktif di brand sudah commit scrape (jam server)
--      pada/sesudah missing_since (>=, termasuk commit yang menandai missing) dan grup tetap
--      tidak ada di master.
--      'missing' → 'active' (batch sama) bila grup kembali ke master sebelum itu.
--   5. Pembagian AWAL baru jalan bila semua grup master brand sudah punya group_created_at
--      (diisi app versi baru saat scrape). App v1.0.38 tidak mengirim field ini → nilai NULL → menunggu.
--   6. Batch akun: messaging_accounts.wa_batch
--        'A'..'ZZ' = akun batch (dibandingkan hanya dengan grup berlabel batch itu)
--        'FULL'    = Full Group (dibandingkan dengan seluruh master brand)
--        'OLD'     = akun lama sebelum 043 — perilaku SAMA dengan FULL, hanya nama berbeda
--        NULL      = (akun WA dibuat app lama setelah 043 / akun TG) — diperlakukan seperti OLD
--      Nama batch grup dibatasi 1–2 huruf supaya tidak pernah bentrok dengan 'OLD' / 'FULL'.
--
-- Kompatibel app v1.0.38: rm_commit_account_scrape tetap membaca baris per key JSON;
-- key 'group_created_at' yang tidak dikirim → NULL. Signature fungsi tidak berubah.
-- Logika master (gate admin + invite, 040) TIDAK diubah — hanya kolom group_created_at ikut dibawa.

BEGIN;

-- 1. Kolom baru ------------------------------------------------------------------
ALTER TABLE public.resource_management_group_scrape_daily
  ADD COLUMN IF NOT EXISTS group_created_at TIMESTAMPTZ;

ALTER TABLE public.resource_management_groups_master
  ADD COLUMN IF NOT EXISTS group_created_at TIMESTAMPTZ;

ALTER TABLE public.resource_management_messaging_accounts
  ADD COLUMN IF NOT EXISTS wa_batch TEXT;

ALTER TABLE public.resource_management_messaging_accounts
  DROP CONSTRAINT IF EXISTS rm_messaging_accounts_wa_batch_check;
ALTER TABLE public.resource_management_messaging_accounts
  ADD CONSTRAINT rm_messaging_accounts_wa_batch_check
  CHECK (
    wa_batch IS NULL
    OR (platform = 'whatsapp' AND (wa_batch ~ '^[A-Z]{1,2}$' OR wa_batch IN ('FULL', 'OLD')))
  );

COMMENT ON COLUMN public.resource_management_messaging_accounts.wa_batch IS
  'Batch akun WA: A..ZZ = batch; FULL = Full Group; OLD = akun lama (perilaku sama dengan FULL); NULL diperlakukan seperti OLD.';

-- Akun WA yang sudah ada sebelum 043 → OLD
UPDATE public.resource_management_messaging_accounts
SET wa_batch = 'OLD'
WHERE platform = 'whatsapp' AND wa_batch IS NULL;

-- 2. Tabel label batch grup ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resource_management_group_batch_labels (
  brand TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform = 'whatsapp'),
  group_id TEXT NOT NULL,
  batch TEXT NOT NULL CHECK (batch ~ '^[A-Z]{1,2}$'),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'missing', 'released')),
  group_created_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  missing_since TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (brand, platform, group_id),
  CHECK (status <> 'missing' OR missing_since IS NOT NULL),
  CHECK (status <> 'released' OR released_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS rm_group_batch_labels_slot_idx
  ON public.resource_management_group_batch_labels (brand, platform, batch)
  WHERE status IN ('active', 'missing');

ALTER TABLE public.resource_management_group_batch_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rm_group_batch_labels_select ON public.resource_management_group_batch_labels;
CREATE POLICY rm_group_batch_labels_select
  ON public.resource_management_group_batch_labels
  FOR SELECT TO anon, authenticated USING (true);
-- Sengaja TIDAK ada policy INSERT/UPDATE/DELETE: penulisan hanya lewat fungsi SECURITY DEFINER.

COMMENT ON TABLE public.resource_management_group_batch_labels IS
  'Label batch grup WA per brand (otomatis dari master, tidak bisa diedit). Lihat migrasi 043.';

-- 3. Waktu commit scrape terakhir per akun (jam SERVER) --------------------------
-- scraped_at daily & scrape_runs.completed_at diisi jam PC user → tidak dipakai untuk aturan release.
CREATE TABLE IF NOT EXISTS public.resource_management_account_scrape_commits (
  account_id UUID PRIMARY KEY
    REFERENCES public.resource_management_messaging_accounts(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  committed_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.resource_management_account_scrape_commits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rm_account_scrape_commits_select ON public.resource_management_account_scrape_commits;
CREATE POLICY rm_account_scrape_commits_select
  ON public.resource_management_account_scrape_commits
  FOR SELECT TO anon, authenticated USING (true);

-- 4. Nama batch dari index 0-based: 0→A, 25→Z, 26→AA ----------------------------
CREATE OR REPLACE FUNCTION public.rm_batch_letter(p_index INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out TEXT := '';
  v_i INTEGER := p_index;
BEGIN
  -- 0..701 = A..ZZ (maks 2 huruf, tidak bentrok dengan 'OLD' / 'FULL')
  IF p_index IS NULL OR p_index < 0 OR p_index > 701 THEN
    RAISE EXCEPTION 'invalid batch index %', p_index;
  END IF;
  LOOP
    v_out := chr(65 + (v_i % 26)) || v_out;
    v_i := (v_i / 26) - 1;
    EXIT WHEN v_i < 0;
  END LOOP;
  RETURN v_out;
END;
$$;

-- Kebalikan rm_batch_letter: A→0, Z→25, AA→26
CREATE OR REPLACE FUNCTION public.rm_batch_index(p_batch TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_n INTEGER := 0;
  v_c INTEGER;
BEGIN
  FOR v_c IN SELECT ascii(ch) FROM regexp_split_to_table(p_batch, '') AS ch LOOP
    v_n := v_n * 26 + (v_c - 64);
  END LOOP;
  RETURN v_n - 1;
END;
$$;

-- 5. Sync label dari master ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rm_sync_group_batch_labels(
  p_brand TEXT,
  p_platform TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_cap CONSTANT INTEGER := 400;
  v_brand TEXT := trim(p_brand);
  v_now TIMESTAMPTZ := now();
  v_reactivated INTEGER := 0;
  v_missing INTEGER := 0;
  v_released INTEGER := 0;
  v_assigned INTEGER := 0;
  v_held INTEGER := 0;
  v_master INTEGER := 0;
  v_master_no_created INTEGER := 0;
  v_idx INTEGER;
  r RECORD;
BEGIN
  IF p_platform IS DISTINCT FROM 'whatsapp' THEN
    RETURN jsonb_build_object('skipped', 'platform_not_whatsapp');
  END IF;
  IF v_brand = '' THEN
    RAISE EXCEPTION 'BRAND_REQUIRED';
  END IF;

  -- Kunci sama dengan rm_commit_account_scrape (re-entrant dalam satu transaksi).
  PERFORM pg_advisory_xact_lock(hashtext(v_brand || E'\x1f' || p_platform));

  -- a) missing → active bila grup kembali ke master (batch tetap)
  UPDATE public.resource_management_group_batch_labels l
  SET status = 'active',
      missing_since = NULL,
      updated_at = v_now
  FROM public.resource_management_groups_master m
  WHERE l.brand = v_brand AND l.platform = p_platform AND l.status = 'missing'
    AND m.brand = v_brand AND m.platform = p_platform AND m.group_id = l.group_id;
  GET DIAGNOSTICS v_reactivated = ROW_COUNT;

  -- Lengkapi group_created_at label aktif dari master (informasi saja, tidak memindah batch)
  UPDATE public.resource_management_group_batch_labels l
  SET group_created_at = m.group_created_at,
      updated_at = v_now
  FROM public.resource_management_groups_master m
  WHERE l.brand = v_brand AND l.platform = p_platform AND l.status = 'active'
    AND l.group_created_at IS NULL AND m.group_created_at IS NOT NULL
    AND m.brand = v_brand AND m.platform = p_platform AND m.group_id = l.group_id;

  -- b) active → missing bila grup tidak ada di master
  UPDATE public.resource_management_group_batch_labels l
  SET status = 'missing',
      missing_since = v_now,
      updated_at = v_now
  WHERE l.brand = v_brand AND l.platform = p_platform AND l.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.resource_management_groups_master m
      WHERE m.brand = v_brand AND m.platform = p_platform AND m.group_id = l.group_id
    );
  GET DIAGNOSTICS v_missing = ROW_COUNT;

  -- c) missing → released bila semua akun WA aktif brand sudah commit sesudah missing_since
  UPDATE public.resource_management_group_batch_labels l
  SET status = 'released',
      released_at = v_now,
      updated_at = v_now
  WHERE l.brand = v_brand AND l.platform = p_platform AND l.status = 'missing'
    AND NOT EXISTS (
      SELECT 1
      FROM public.resource_management_messaging_accounts a
      JOIN public.resource_management_brands b ON b.id = a.brand_id
      WHERE b.name = v_brand
        AND a.platform = p_platform
        AND a.is_active
        AND NOT EXISTS (
          SELECT 1 FROM public.resource_management_account_scrape_commits c
          -- >= : akun yang commit-nya menandai grup 'missing' (transaksi sama) ikut dihitung.
          WHERE c.account_id = a.id AND c.committed_at >= l.missing_since
        )
    );
  GET DIAGNOSTICS v_released = ROW_COUNT;

  SELECT count(*) INTO v_held
  FROM public.resource_management_group_batch_labels l
  WHERE l.brand = v_brand AND l.platform = p_platform AND l.status IN ('active', 'missing');

  SELECT count(*), count(*) FILTER (WHERE m.group_created_at IS NULL)
  INTO v_master, v_master_no_created
  FROM public.resource_management_groups_master m
  WHERE m.brand = v_brand AND m.platform = p_platform;

  -- d) Pembagian AWAL (belum ada label aktif/missing di brand)
  IF v_held = 0 THEN
    IF v_master = 0 THEN
      RETURN jsonb_build_object('brand', v_brand, 'state', 'no_master');
    END IF;
    IF v_master_no_created > 0 THEN
      -- Tunggu sampai semua grup master punya tanggal dibuat (scrape app versi baru).
      RETURN jsonb_build_object(
        'brand', v_brand,
        'state', 'waiting_created_at',
        'master', v_master,
        'master_without_created_at', v_master_no_created,
        'released', v_released
      );
    END IF;

    INSERT INTO public.resource_management_group_batch_labels AS l (
      brand, platform, group_id, batch, status, group_created_at,
      assigned_at, missing_since, released_at, updated_at
    )
    SELECT
      v_brand, p_platform, o.group_id,
      public.rm_batch_letter(((o.rn - 1) / c_cap)::INTEGER),
      'active', o.group_created_at, v_now, NULL, NULL, v_now
    FROM (
      SELECT m.group_id, m.group_created_at,
             row_number() OVER (ORDER BY m.group_created_at ASC, m.group_id ASC) AS rn
      FROM public.resource_management_groups_master m
      WHERE m.brand = v_brand AND m.platform = p_platform
    ) o
    ON CONFLICT (brand, platform, group_id) DO UPDATE
      SET batch = EXCLUDED.batch,
          status = 'active',
          group_created_at = EXCLUDED.group_created_at,
          assigned_at = v_now,
          missing_since = NULL,
          released_at = NULL,
          updated_at = v_now;
    GET DIAGNOSTICS v_assigned = ROW_COUNT;

    RETURN jsonb_build_object(
      'brand', v_brand, 'state', 'initial_assigned',
      'assigned', v_assigned, 'released', v_released
    );
  END IF;

  -- e) Grup master baru (belum punya label aktif/missing) → batch paling awal yang < 400
  FOR r IN
    SELECT m.group_id, m.group_created_at
    FROM public.resource_management_groups_master m
    WHERE m.brand = v_brand AND m.platform = p_platform
      AND NOT EXISTS (
        SELECT 1 FROM public.resource_management_group_batch_labels l
        WHERE l.brand = v_brand AND l.platform = p_platform
          AND l.group_id = m.group_id AND l.status IN ('active', 'missing')
      )
    ORDER BY m.group_created_at ASC NULLS LAST, m.group_id ASC
  LOOP
    SELECT s.idx INTO v_idx
    FROM (
      SELECT public.rm_batch_index(l.batch) AS idx, count(*) AS used
      FROM public.resource_management_group_batch_labels l
      WHERE l.brand = v_brand AND l.platform = p_platform AND l.status IN ('active', 'missing')
      GROUP BY l.batch
    ) s
    WHERE s.used < c_cap
    ORDER BY s.idx
    LIMIT 1;

    IF v_idx IS NULL THEN
      SELECT coalesce(max(public.rm_batch_index(l.batch)), -1) + 1 INTO v_idx
      FROM public.resource_management_group_batch_labels l
      WHERE l.brand = v_brand AND l.platform = p_platform AND l.status IN ('active', 'missing');
    END IF;

    INSERT INTO public.resource_management_group_batch_labels AS l (
      brand, platform, group_id, batch, status, group_created_at,
      assigned_at, missing_since, released_at, updated_at
    )
    VALUES (
      v_brand, p_platform, r.group_id, public.rm_batch_letter(v_idx), 'active',
      r.group_created_at, v_now, NULL, NULL, v_now
    )
    ON CONFLICT (brand, platform, group_id) DO UPDATE
      SET batch = EXCLUDED.batch,
          status = 'active',
          group_created_at = EXCLUDED.group_created_at,
          assigned_at = v_now,
          missing_since = NULL,
          released_at = NULL,
          updated_at = v_now;

    v_assigned := v_assigned + 1;
    v_idx := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'brand', v_brand, 'state', 'synced',
    'reactivated', v_reactivated, 'missing', v_missing,
    'released', v_released, 'assigned', v_assigned
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rm_sync_group_batch_labels(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- 6. rm_commit_account_scrape — salinan 040 + group_created_at + commit log + sync label ----
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

  -- Waktu commit (jam server) — dasar aturan release slot batch.
  INSERT INTO public.resource_management_account_scrape_commits (account_id, brand, platform, committed_at)
  VALUES (p_account_id, v_brand, p_platform, v_now)
  ON CONFLICT (account_id) DO UPDATE
    SET brand = EXCLUDED.brand, platform = EXCLUDED.platform, committed_at = EXCLUDED.committed_at;

  -- Sync label batch (WA). Gagal sync TIDAK boleh menggagalkan commit scrape.
  IF p_platform = 'whatsapp' THEN
    BEGIN
      v_batch := public.rm_sync_group_batch_labels(v_brand, p_platform);
    EXCEPTION WHEN OTHERS THEN
      v_batch := jsonb_build_object('error', left(SQLERRM, 300));
    END;
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

-- 7. rm_rebuild_brand_groups_master — salinan 040 + group_created_at + sync label ----
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
  'Atomik: replace daily akun + rebuild master brand+platform (WA+TG) + catat waktu commit + sync label batch WA (043). Master: ≥1 is_admin=yes AND ≥1 invite valid (boleh beda baris/akun).';

COMMENT ON FUNCTION public.rm_rebuild_brand_groups_master(TEXT, TEXT) IS
  'Rebuild master dari daily brand+platform (WA+TG) + sync label batch WA (043). Master: ≥1 is_admin=yes AND ≥1 invite valid (boleh beda baris/akun).';

GRANT EXECUTE ON FUNCTION public.rm_commit_account_scrape(UUID, TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rm_rebuild_brand_groups_master(TEXT, TEXT) TO anon, authenticated;

COMMIT;
