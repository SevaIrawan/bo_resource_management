-- Atomik: DELETE daily per akun + INSERT hasil scrape (satu transaksi).
CREATE OR REPLACE FUNCTION public.rm_replace_account_scrape_daily(
  p_account_id UUID,
  p_rows JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'account_id required';
  END IF;

  DELETE FROM public.resource_management_group_scrape_daily
  WHERE account_id = p_account_id;

  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

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
    COALESCE((r->>'scraped_at')::TIMESTAMPTZ, now()),
    COALESCE((r->>'created_at')::TIMESTAMPTZ, now()),
    r->>'brand',
    r->>'acc_name',
    COALESCE(r->>'phone_number', '')
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.rm_replace_account_scrape_daily IS
  'Scrape pipeline step 3+4: replace all daily rows for one account atomically.';

GRANT EXECUTE ON FUNCTION public.rm_replace_account_scrape_daily(UUID, JSONB) TO anon, authenticated;
