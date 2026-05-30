-- =============================================================================
-- Resource Management — RLS login ke public.users (EXISTING)
-- =============================================================================
-- TIDAK membuat tabel users.
-- Tabel public.users sudah ada: id, username, password, role, ...
-- Login app: SELECT id, username WHERE username + password cocok.
-- Jalankan sekali di SQL Editor jika login gagal karena RLS block.
-- =============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rm_users_app_login_select ON public.users;
CREATE POLICY rm_users_app_login_select ON public.users
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON POLICY rm_users_app_login_select ON public.users IS
  '[RM] Izinkan app baca public.users untuk login (username + password).';

DROP FUNCTION IF EXISTS public.resource_management_login(TEXT, TEXT);
