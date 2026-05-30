-- =============================================================================
-- Resource Management — phone_or_username on daily + master (ACCOUNT phone, bukan participant)
-- =============================================================================
-- Semantik:
--   phone_or_username = nomor/username AKUN WA/TG yang scrape (bukan member di group).
--   Sumber: resource_management_messaging_accounts.phone_or_username
--   Diisi user saat Add Account di card UI; boleh NULL jika user tidak isi.
--   Saat scraper jalan: kolom ini auto-copy dari registry akun (account_id).
-- =============================================================================

-- ── Daily (raw scraper) ───────────────────────────────────────────────────────
ALTER TABLE public.resource_management_group_scrape_daily
  ADD COLUMN IF NOT EXISTS phone_or_username TEXT;

COMMENT ON COLUMN public.resource_management_group_scrape_daily.phone_or_username IS
  'Phone/username AKUN WA/TG (bukan participant group). Dari messaging_accounts; NULL jika belum diisi user.';

UPDATE public.resource_management_group_scrape_daily AS d
SET phone_or_username = NULLIF(TRIM(a.phone_or_username), '')
FROM public.resource_management_messaging_accounts AS a
WHERE d.account_id = a.id
  AND (d.phone_or_username IS NULL OR TRIM(d.phone_or_username) = '');

CREATE INDEX IF NOT EXISTS idx_rm_group_scrape_daily_brand_acc_phone
  ON public.resource_management_group_scrape_daily(brand, acc_name, phone_or_username)
  WHERE phone_or_username IS NOT NULL;

-- ── Master (clean / source of truth) ──────────────────────────────────────────
ALTER TABLE public.resource_management_groups_master
  ADD COLUMN IF NOT EXISTS phone_or_username TEXT;

COMMENT ON COLUMN public.resource_management_groups_master.phone_or_username IS
  'Phone/username AKUN WA/TG (bukan participant group). Dari messaging_accounts; NULL jika belum diisi user.';

UPDATE public.resource_management_groups_master AS m
SET phone_or_username = NULLIF(TRIM(a.phone_or_username), '')
FROM public.resource_management_messaging_accounts AS a
WHERE m.account_id = a.id
  AND (m.phone_or_username IS NULL OR TRIM(m.phone_or_username) = '');

CREATE INDEX IF NOT EXISTS idx_rm_groups_master_brand_acc_phone
  ON public.resource_management_groups_master(brand, acc_name, phone_or_username)
  WHERE phone_or_username IS NOT NULL;
