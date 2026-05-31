-- Bersihkan duplikat is_active=true per account (PostgREST maybeSingle gagal jika >1 baris).
UPDATE public.resource_management_platform_sessions AS ps
SET
  is_active = false,
  disconnected_at = NOW(),
  disconnect_reason = 'cleanup_duplicate',
  updated_at = NOW()
WHERE ps.is_active = true
  AND ps.id NOT IN (
    SELECT DISTINCT ON (account_id) id
    FROM public.resource_management_platform_sessions
    WHERE is_active = true
    ORDER BY account_id, updated_at DESC NULLS LAST, connected_at DESC NULLS LAST
  );
