-- =============================================================================
-- Resource Management — Scraper: brand & acc_name on daily + master
-- =============================================================================
-- JALANKAN jika 001_foundation.sql sudah pernah di-apply sebelum kolom ini ada.
-- =============================================================================

-- ── Daily (raw scraper) ───────────────────────────────────────────────────────
ALTER TABLE public.resource_management_group_scrape_daily
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS acc_name TEXT;

UPDATE public.resource_management_group_scrape_daily AS d
SET
  brand = COALESCE(NULLIF(TRIM(d.brand), ''), NULLIF(TRIM(a.metadata->>'brand'), ''), 'unknown'),
  acc_name = COALESCE(NULLIF(TRIM(d.acc_name), ''), NULLIF(TRIM(a.label), ''), 'unknown')
FROM public.resource_management_messaging_accounts AS a
WHERE d.account_id = a.id
  AND (d.brand IS NULL OR d.acc_name IS NULL OR TRIM(d.brand) = '' OR TRIM(d.acc_name) = '');

UPDATE public.resource_management_group_scrape_daily
SET brand = 'unknown'
WHERE brand IS NULL OR TRIM(brand) = '';

UPDATE public.resource_management_group_scrape_daily
SET acc_name = 'unknown'
WHERE acc_name IS NULL OR TRIM(acc_name) = '';

ALTER TABLE public.resource_management_group_scrape_daily
  ALTER COLUMN brand SET NOT NULL,
  ALTER COLUMN acc_name SET NOT NULL;

COMMENT ON COLUMN public.resource_management_group_scrape_daily.brand IS
  'Brand pemilik akun — pemisah multi-brand';
COMMENT ON COLUMN public.resource_management_group_scrape_daily.acc_name IS
  'Nama akun WA/TG yang dipakai saat scrape';

CREATE INDEX IF NOT EXISTS idx_rm_group_scrape_daily_brand
  ON public.resource_management_group_scrape_daily(brand);
CREATE INDEX IF NOT EXISTS idx_rm_group_scrape_daily_brand_acc
  ON public.resource_management_group_scrape_daily(brand, acc_name);

-- ── Master (clean / source of truth) ──────────────────────────────────────────
ALTER TABLE public.resource_management_groups_master
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS acc_name TEXT;

UPDATE public.resource_management_groups_master AS m
SET
  brand = COALESCE(NULLIF(TRIM(m.brand), ''), NULLIF(TRIM(a.metadata->>'brand'), ''), 'unknown'),
  acc_name = COALESCE(NULLIF(TRIM(m.acc_name), ''), NULLIF(TRIM(a.label), ''), 'unknown')
FROM public.resource_management_messaging_accounts AS a
WHERE m.account_id = a.id
  AND (m.brand IS NULL OR m.acc_name IS NULL OR TRIM(m.brand) = '' OR TRIM(m.acc_name) = '');

UPDATE public.resource_management_groups_master
SET brand = 'unknown'
WHERE brand IS NULL OR TRIM(brand) = '';

UPDATE public.resource_management_groups_master
SET acc_name = 'unknown'
WHERE acc_name IS NULL OR TRIM(acc_name) = '';

ALTER TABLE public.resource_management_groups_master
  ALTER COLUMN brand SET NOT NULL,
  ALTER COLUMN acc_name SET NOT NULL;

COMMENT ON COLUMN public.resource_management_groups_master.brand IS
  'Brand pemilik akun — pemisah multi-brand';
COMMENT ON COLUMN public.resource_management_groups_master.acc_name IS
  'Nama akun WA/TG yang dipakai';

CREATE INDEX IF NOT EXISTS idx_rm_groups_master_brand
  ON public.resource_management_groups_master(brand);
CREATE INDEX IF NOT EXISTS idx_rm_groups_master_brand_acc
  ON public.resource_management_groups_master(brand, acc_name);
